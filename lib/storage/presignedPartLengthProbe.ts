import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { readObjectStorageConfig, type ObjectStorageEnv } from "./objectStore";
import {
  PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS,
  signUploadPartUrl,
  uploadPartChecksumSha256Supported,
} from "./presignedUploadPart";

export const SPIKE_ORG_ID = "spike-org";
export const SPIKE_DOC_ID = "spike-doc";
export const SPIKE_SIGNED_PART_BYTES = 64;

const RESPONSE_BYTE_CAP = 65_536;

export class SpikeStorageRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpikeStorageRefused";
  }
}

export interface SpikeEnv extends ObjectStorageEnv {
  SPIKE_BUCKET?: string;
  SPIKE_ENDPOINT?: string;
  SPIKE_REGION?: string;
  SPIKE_STORAGE_ENV?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}

/** Production Neon branch. Refused on the parsed, lowercased hostname. */
const PRODUCTION_NEON_BRANCH_ID = "br-plain-dawn-b56i00z1";
/** Production bucket. Trimmed, exact, case-insensitive, after the strict name check. */
const PRODUCTION_BUCKET_NAME = "uploads";
/** Neon Object Storage branch host. The client receives this host's origin only. */
const NEON_BRANCH_HOST = /^br-[a-z0-9-]+\.storage\.c-\d+\.[a-z0-9-]+\.aws\.neon\.tech$/;
/** Strict S3 bucket name, length 3–63, no uppercase and no consecutive dots. */
const S3_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export interface SpikeAttempt {
  name: "exact" | "over" | "under" | "checksum-match" | "checksum-mismatch";
  bytes: number;
  httpStatus: number | null;
  errorCode: string | null;
  rejected: boolean | null;
  error: string | null;
}

export interface SpikeReport {
  key: string;
  uploadId: string | null;
  bucket: string;
  endpointHost: string;
  forcePathStyle: true;
  signedContentLength: number;
  expiresSeconds: number;
  checksumSupported: boolean;
  attempts: SpikeAttempt[];
  aborted: boolean;
  abortError: string | null;
}

export function spikeUploadPartKey(intentId: string): string {
  if (!/^spike-[A-Za-z0-9-]{8,80}$/.test(intentId)) {
    throw new SpikeStorageRefused("Spike intent id must be an obvious spike id.");
  }
  return `org/${SPIKE_ORG_ID}/doc/${SPIKE_DOC_ID}/staging/${intentId}.pdf`;
}

/** Drop URLs, signatures, and access-key ids before anything is printed. */
export function redactSecrets(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[redacted-key]")
    .replace(/(?:X-Amz-[A-Za-z0-9-]+|Signature|AWSAccessKeyId)=(?:[^&\s]+)/gi, "[redacted-amz]");
}

export function looksLikeProductionName(value: string): boolean {
  const tokens = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => {
    if (token === "nonprod" || token.startsWith("nonprod")) return false;
    return token.includes("prod");
  });
}

export function spikeRefusalReason(env: SpikeEnv): string | null {
  const bucketShape = bucketShapeRefusal(env);
  if (bucketShape) return bucketShape;
  const productionBucket = productionBucketRefusal(env);
  if (productionBucket) return productionBucket;
  const bucket = trimmed(env.SPIKE_BUCKET);
  const endpoint = trimmed(env.SPIKE_ENDPOINT);
  if (!bucket) return "Refusing to run: set SPIKE_BUCKET to an explicit non-production bucket.";
  if (env.SPIKE_STORAGE_ENV !== "nonprod") {
    return "Refusing to run: set SPIKE_STORAGE_ENV=nonprod. The spike does not guess.";
  }
  if (env.VERCEL_ENV === "production") return "Refusing to run: VERCEL_ENV=production.";
  if (env.NODE_ENV === "production") return "Refusing to run: NODE_ENV=production.";
  if (looksLikeProductionName(bucket)) return "Refusing to run: SPIKE_BUCKET looks like production.";
  const appBucket = first(env.OBJECT_STORAGE_BUCKET, env.DOCUMENT_STORAGE_BUCKET);
  if (appBucket && looksLikeProductionName(appBucket)) {
    return "Refusing to run: the configured document bucket looks like production.";
  }
  for (const [name, value] of endpointFields(env)) {
    const reason = endpointShapeRefusal(name, value);
    if (reason) return reason;
  }
  if (!endpoint) {
    return "Refusing to run: set SPIKE_ENDPOINT to the non-production endpoint. An unset endpoint is refused.";
  }
  const resolved = first(env.OBJECT_STORAGE_ENDPOINT, env.AWS_ENDPOINT_URL_S3);
  if (!resolved) {
    return "Refusing to run: set OBJECT_STORAGE_ENDPOINT or AWS_ENDPOINT_URL_S3 to the same value as SPIKE_ENDPOINT.";
  }
  if (resolved !== endpoint) {
    return "Refusing to run: SPIKE_ENDPOINT must exactly match OBJECT_STORAGE_ENDPOINT or AWS_ENDPOINT_URL_S3.";
  }
  for (const candidate of [env.OBJECT_STORAGE_ENDPOINT, env.AWS_ENDPOINT_URL_S3]) {
    const value = trimmed(candidate);
    if (!value || value === endpoint) continue;
    return "Refusing to run: OBJECT_STORAGE_ENDPOINT and AWS_ENDPOINT_URL_S3 disagree.";
  }
  if (!spikeRegion(env)) {
    return "Refusing to run: set AWS_REGION or SPIKE_REGION. The spike does not default to us-east-1.";
  }
  return null;
}

export function readSpikeStorageConfig(env: SpikeEnv) {
  const reason = spikeRefusalReason(env);
  if (reason) throw new SpikeStorageRefused(reason);
  const bucket = trimmed(env.SPIKE_BUCKET);
  const endpoint = trimmed(env.SPIKE_ENDPOINT);
  const region = spikeRegion(env);
  const origin = endpoint ? validatedOrigin(endpoint) : undefined;
  if (!bucket || !endpoint || !region || !origin) throw new SpikeStorageRefused("Refusing to run: spike target is incomplete.");
  let config;
  try {
    config = readObjectStorageConfig({
      ...env,
      OBJECT_STORAGE_BUCKET: bucket,
      DOCUMENT_STORAGE_BUCKET: bucket,
      OBJECT_STORAGE_ENDPOINT: origin,
      AWS_ENDPOINT_URL_S3: origin,
      OBJECT_STORAGE_REGION: region,
      AWS_REGION: region,
    });
  } catch {
    throw new SpikeStorageRefused("Refusing to run: object storage credentials are missing or invalid.");
  }
  if (!config?.endpoint || config.bucket !== bucket || config.endpoint !== origin || config.region !== region) {
    throw new SpikeStorageRefused("Refusing to run: resolved storage target is not the spike bucket and endpoint.");
  }
  return { ...config, forcePathStyle: true as const };
}

export async function runPresignedPartLengthProbe(env: SpikeEnv = process.env): Promise<SpikeReport> {
  const config = readSpikeStorageConfig(env);
  const endpointHost = new URL(config.endpoint ?? "").hostname;
  const intentId = `spike-${randomUUID()}`;
  const key = spikeUploadPartKey(intentId);
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    logger: silentLogger,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const report: SpikeReport = {
    key,
    uploadId: null,
    bucket: config.bucket,
    endpointHost,
    forcePathStyle: true,
    signedContentLength: SPIKE_SIGNED_PART_BYTES,
    expiresSeconds: PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS,
    checksumSupported: uploadPartChecksumSha256Supported(),
    attempts: [],
    aborted: false,
    abortError: null,
  };
  let uploadId: string | undefined;
  try {
    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: "application/pdf",
    }));
    uploadId = created.UploadId;
    report.uploadId = uploadId ?? null;
    if (!uploadId) throw new SpikeStorageRefused("CreateMultipartUpload returned no upload id.");
    const exact = Buffer.alloc(SPIKE_SIGNED_PART_BYTES, 0x61);
    const lengthUrl = await signUploadPartUrl(client, {
      bucket: config.bucket,
      key,
      uploadId,
      partNumber: 1,
      contentLength: SPIKE_SIGNED_PART_BYTES,
    });
    report.attempts.push(await attempt("exact", lengthUrl, exact));
    report.attempts.push(await attempt("over", lengthUrl, Buffer.alloc(SPIKE_SIGNED_PART_BYTES + 1, 0x61)));
    report.attempts.push(await attempt("under", lengthUrl, Buffer.alloc(SPIKE_SIGNED_PART_BYTES - 1, 0x61)));
    if (report.checksumSupported) {
      const checksum = createHash("sha256").update(exact).digest("base64");
      const checksumUrl = await signUploadPartUrl(client, {
        bucket: config.bucket,
        key,
        uploadId,
        partNumber: 2,
        contentLength: SPIKE_SIGNED_PART_BYTES,
        checksumSha256: checksum,
      });
      const headers = { "x-amz-checksum-sha256": checksum };
      report.attempts.push(await attempt("checksum-match", checksumUrl, exact, headers));
      report.attempts.push(await attempt(
        "checksum-mismatch",
        checksumUrl,
        Buffer.alloc(SPIKE_SIGNED_PART_BYTES, 0x62),
        headers,
      ));
    }
  } catch (error) {
    report.abortError = sdkFailure(error);
  } finally {
    if (uploadId) {
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: config.bucket,
          Key: key,
          UploadId: uploadId,
        }));
        report.aborted = true;
      } catch (error) {
        report.aborted = false;
        report.abortError = sdkFailure(error);
      }
    }
    client.destroy();
  }
  return report;
}

async function attempt(
  name: SpikeAttempt["name"],
  url: string,
  body: Buffer,
  headers: Record<string, string> = {},
): Promise<SpikeAttempt> {
  try {
    const result = await putPart(url, body, headers);
    return { name, bytes: body.byteLength, ...result, error: null };
  } catch (error) {
    return {
      name,
      bytes: body.byteLength,
      httpStatus: null,
      errorCode: null,
      rejected: null,
      error: sdkFailure(error),
    };
  }
}

function putPart(
  url: string,
  body: Buffer,
  extraHeaders: Record<string, string>,
): Promise<Pick<SpikeAttempt, "httpStatus" | "errorCode" | "rejected">> {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = transport(target, {
      method: "PUT",
      headers: {
        "content-length": String(body.byteLength),
        ...extraHeaders,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let received = 0;
      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > RESPONSE_BYTE_CAP) {
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const errorCode = raw.match(/<Code>([A-Za-z0-9]+)<\/Code>/)?.[1] ?? null;
        const httpStatus = res.statusCode ?? 0;
        resolve({ httpStatus, errorCode, rejected: httpStatus >= 400 });
      });
      res.on("error", () => reject(new Error("UploadPart response failed.")));
    });
    req.setTimeout(20_000, () => req.destroy(Object.assign(new Error("UploadPart PUT timed out."), { code: "ETIMEDOUT" })));
    req.on("error", (error: NodeJS.ErrnoException) => {
      reject(new Error(error.code ? `UploadPart PUT failed (${error.code}).` : "UploadPart PUT failed."));
    });
    req.write(body);
    req.end();
  });
}

function sdkFailure(error: unknown): string {
  if (error instanceof SpikeStorageRefused) return error.message;
  if (!error || typeof error !== "object") return "Object storage request failed.";
  const record = error as { name?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  if (record.name === "SpikeStorageRefused" && record.message) return redactSecrets(record.message);
  const status = record.$metadata?.httpStatusCode;
  const name = record.name && /^[A-Za-z][A-Za-z0-9]+$/.test(record.name) ? record.name : null;
  if (name) return status ? `${name} (${status})` : name;
  if (record.code && /^[A-Z0-9_]+$/.test(record.code)) return `UploadPart PUT failed (${record.code}).`;
  if (record.message && record.message.startsWith("UploadPart PUT failed")) return record.message;
  if (record.message === "UploadPart PUT timed out.") return record.message;
  return "Object storage request failed.";
}

function endpointFields(env: SpikeEnv): Array<readonly [string, string | undefined]> {
  return [
    ["SPIKE_ENDPOINT", env.SPIKE_ENDPOINT],
    ["AWS_ENDPOINT_URL_S3", env.AWS_ENDPOINT_URL_S3],
    ["OBJECT_STORAGE_ENDPOINT", env.OBJECT_STORAGE_ENDPOINT],
  ];
}

function endpointShapeRefusal(name: string, value: string | undefined): string | null {
  if (!value?.trim()) return null;
  if (value.includes("%") || /[^\u0000-\u007F]/.test(value)) {
    return `Refusing to run: ${name} contains percent-encoding or a non-ASCII character.`;
  }
  const parsed = parseSpikeEndpoint(name, value);
  if (typeof parsed === "string") return parsed;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname.includes(PRODUCTION_NEON_BRANCH_ID)) {
    return `Refusing to run: ${name} contains the production Neon branch ${PRODUCTION_NEON_BRANCH_ID}.`;
  }
  if (looksLikeProductionName(hostname)) return `Refusing to run: ${name} looks like production.`;
  if (!NEON_BRANCH_HOST.test(hostname)) {
    return `Refusing to run: ${name} host is not a Neon branch storage host.`;
  }
  return null;
}

function parseSpikeEndpoint(name: string, value: string): URL | string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return `Refusing to run: ${name} is not a URL.`;
  }
  if (url.username || url.password || url.search || url.hash || /X-Amz-Signature/i.test(value)) {
    return `Refusing to run: ${name} must be the storage origin. Presigned URLs are refused and are not printed.`;
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return `Refusing to run: ${name} must be an origin without a path.`;
  }
  if (url.protocol !== "https:") return `Refusing to run: ${name} must be https.`;
  return url;
}

/** Origin of an endpoint that already passed the guard. This is the only string given to S3. */
function validatedOrigin(value: string): string | undefined {
  const parsed = parseSpikeEndpoint("SPIKE_ENDPOINT", value);
  if (typeof parsed === "string") return undefined;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname.includes(PRODUCTION_NEON_BRANCH_ID) || looksLikeProductionName(hostname) || !NEON_BRANCH_HOST.test(hostname)) {
    return undefined;
  }
  return parsed.origin;
}

function bucketShapeRefusal(env: SpikeEnv): string | null {
  const fields = [
    ["SPIKE_BUCKET", env.SPIKE_BUCKET],
    ["OBJECT_STORAGE_BUCKET", env.OBJECT_STORAGE_BUCKET],
    ["DOCUMENT_STORAGE_BUCKET", env.DOCUMENT_STORAGE_BUCKET],
  ] as const;
  for (const [name, value] of fields) {
    const text = trimmed(value);
    if (!text) continue;
    if (!S3_BUCKET_NAME.test(text) || text.includes("..")) {
      return `Refusing to run: ${name} is not a strict S3 bucket name.`;
    }
  }
  return null;
}

function productionBucketRefusal(env: SpikeEnv): string | null {
  const fields = [
    ["SPIKE_BUCKET", env.SPIKE_BUCKET],
    ["OBJECT_STORAGE_BUCKET", env.OBJECT_STORAGE_BUCKET],
    ["DOCUMENT_STORAGE_BUCKET", env.DOCUMENT_STORAGE_BUCKET],
  ] as const;
  for (const [name, value] of fields) {
    if (trimmed(value)?.toLowerCase() === PRODUCTION_BUCKET_NAME) {
      return `Refusing to run: ${name} is the production bucket ${PRODUCTION_BUCKET_NAME}.`;
    }
  }
  return null;
}

/** SPIKE_REGION wins when set. There is no us-east-1 default. */
function spikeRegion(env: SpikeEnv): string | undefined {
  return trimmed(env.SPIKE_REGION) ?? trimmed(env.AWS_REGION);
}

function trimmed(value: string | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

function first(...values: Array<string | undefined>) {
  for (const value of values) {
    const text = trimmed(value);
    if (text) return text;
  }
  return undefined;
}

const silentLogger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
