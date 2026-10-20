import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import {
  looksLikeProductionName,
  readSpikeStorageConfig,
  redactSecrets,
  runPresignedPartLengthProbe,
  spikeRefusalReason,
  spikeUploadPartKey,
  SpikeStorageRefused,
} from "./presignedPartLengthProbe";
import {
  PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS,
  PresignedUploadPartError,
  signUploadPartUrl,
  uploadPartChecksumSha256Supported,
} from "./presignedUploadPart";

const KEY = "org/spike-org/doc/spike-doc/staging/spike-intent-0123456789.pdf";

function signingClient() {
  return new S3Client({
    region: "us-east-1",
    endpoint: "https://storage.example.test",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: "spike-key", secretAccessKey: "spike-secret" },
  });
}

function signedPartFacts(url: string) {
  const parsed = new URL(url);
  return {
    expires: Number(parsed.searchParams.get("X-Amz-Expires")),
    signedHeaders: (parsed.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";").filter(Boolean),
    operation: parsed.searchParams.get("x-id"),
    partNumber: parsed.searchParams.get("partNumber"),
    hasUploadId: parsed.searchParams.has("uploadId"),
    hasContentLengthQuery: parsed.searchParams.has("content-length") || parsed.searchParams.has("Content-Length"),
    hasChecksumQuery: parsed.searchParams.has("x-amz-checksum-sha256"),
    pathname: parsed.pathname,
    signature: parsed.searchParams.get("X-Amz-Signature") ?? "",
  };
}

describe("presigned UploadPart signer", () => {
  it("signs content-length into an UploadPart PUT that expires within 900 seconds", async () => {
    const url = await signUploadPartUrl(signingClient(), {
      bucket: "branch-spike",
      key: KEY,
      uploadId: "upload-1",
      partNumber: 1,
      contentLength: 64,
    });
    const facts = signedPartFacts(url);
    expect(facts.signedHeaders).toContain("content-length");
    expect(facts.expires).toBe(PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS);
    expect(facts.expires).toBeLessThanOrEqual(900);
    expect(facts.operation).toBe("UploadPart");
    expect(facts.partNumber).toBe("1");
    expect(facts.hasUploadId).toBe(true);
    expect(facts.pathname.endsWith(`/${KEY}`)).toBe(true);
    expect(redactSecrets(url)).toBe("[redacted-url]");
    expect(redactSecrets(url)).not.toContain("spike-secret");

    const other = signedPartFacts(await signUploadPartUrl(signingClient(), {
      bucket: "branch-spike",
      key: KEY,
      uploadId: "upload-1",
      partNumber: 1,
      contentLength: 65,
    }, 900));
    expect(other.signedHeaders).toContain("content-length");
    expect(other.expires).toBeLessThanOrEqual(900);
    expect(facts.signature === other.signature).toBe(false);
  });

  it("rejects an expiry past 15 minutes before signing", async () => {
    await expect(signUploadPartUrl(signingClient(), {
      bucket: "branch-spike",
      key: KEY,
      uploadId: "upload-1",
      partNumber: 1,
      contentLength: 64,
    }, 901)).rejects.toBeInstanceOf(PresignedUploadPartError);
  });

  it("signs x-amz-checksum-sha256 on UploadPart when the SDK accepts it", async () => {
    expect(uploadPartChecksumSha256Supported()).toBe(true);
    const checksum = createHash("sha256").update("a").digest("base64");
    const facts = signedPartFacts(await signUploadPartUrl(signingClient(), {
      bucket: "branch-spike",
      key: KEY,
      uploadId: "upload-1",
      partNumber: 2,
      contentLength: 1,
      checksumSha256: checksum,
    }));
    expect(facts.signedHeaders).toContain("content-length");
    expect(facts.signedHeaders).toContain("x-amz-checksum-sha256");
    expect(facts.hasChecksumQuery).toBe(false);
    expect(facts.operation).toBe("UploadPart");
    expect(facts.expires).toBeLessThanOrEqual(900);
  });

  it("only builds UploadPart PUT signatures", () => {
    const source = readFileSync(new URL("./presignedUploadPart.ts", import.meta.url), "utf8");
    expect(source).toContain("UploadPartCommand");
    expect(source).not.toMatch(/PutObjectCommand|GetObjectCommand|UploadPartCopyCommand|DeleteObjectCommand|CreateMultipartUploadCommand|CompleteMultipartUploadCommand/);
  });
});

describe("spike storage guard", () => {
  const endpoint = "https://ep-example.us-east-1.aws.neon.tech";
  const ready = {
    SPIKE_BUCKET: "branch-spike",
    SPIKE_STORAGE_ENV: "nonprod",
    SPIKE_ENDPOINT: endpoint,
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_ACCESS_KEY_ID: "spike-key",
    AWS_SECRET_ACCESS_KEY: "spike-secret",
    AWS_REGION: "us-east-1",
    DOCUMENT_STORAGE_BUCKET: "branch-documents",
  };

  it("requires an explicit non-production bucket and endpoint", () => {
    expect(spikeRefusalReason({})).toMatch(/SPIKE_BUCKET/);
    expect(spikeRefusalReason({ SPIKE_BUCKET: "branch-spike" })).toMatch(/SPIKE_STORAGE_ENV/);
    expect(spikeRefusalReason({ ...ready, VERCEL_ENV: "production" })).toMatch(/VERCEL_ENV=production/);
    expect(spikeRefusalReason({ ...ready, NODE_ENV: "production" })).toMatch(/NODE_ENV=production/);
    expect(spikeRefusalReason({ ...ready, SPIKE_BUCKET: "prod-docs" })).toMatch(/looks like production/);
    expect(spikeRefusalReason({ ...ready, SPIKE_ENDPOINT: "https://prod.neon.tech", AWS_ENDPOINT_URL_S3: "https://prod.neon.tech" })).toMatch(/looks like production/);
    expect(spikeRefusalReason({ ...ready, SPIKE_ENDPOINT: "https://bucket.s3.amazonaws.com", AWS_ENDPOINT_URL_S3: "https://bucket.s3.amazonaws.com" })).toMatch(/not a Neon host/);
    expect(spikeRefusalReason({ ...ready, DOCUMENT_STORAGE_BUCKET: "prod-documents" })).toMatch(/configured document bucket/);
    expect(looksLikeProductionName("nonprod-spike")).toBe(false);
    expect(looksLikeProductionName("production")).toBe(true);
  });

  it("refuses a presigned URL in SPIKE_ENDPOINT without echoing it", () => {
    const pasted = `${endpoint}/org/spike-org/doc/spike-doc/staging/spike-intent.pdf?X-Amz-Signature=deadbeef`;
    const reason = spikeRefusalReason({ ...ready, SPIKE_ENDPOINT: pasted, AWS_ENDPOINT_URL_S3: pasted });
    expect(reason).toMatch(/Presigned URLs are refused/);
    expect(reason).not.toContain("deadbeef");
    expect(reason).not.toContain("X-Amz-Signature=");
  });

  it("uses SPIKE_BUCKET rather than the app bucket", () => {
    expect(readSpikeStorageConfig(ready)).toMatchObject({
      bucket: "branch-spike",
      endpoint,
      forcePathStyle: true,
      accessKeyId: "spike-key",
    });
    expect(spikeUploadPartKey("spike-intent-0123456789")).toBe(KEY);
    expect(() => readSpikeStorageConfig({ ...ready, SPIKE_BUCKET: "" })).toThrow(SpikeStorageRefused);
  });
});

describe.skipIf(!process.env.SPIKE_BUCKET)("live presigned UploadPart length", () => {
  it("probes the spike bucket and aborts the multipart upload", async () => {
    const report = await runPresignedPartLengthProbe();
    expect(report.aborted).toBe(true);
    expect(report.key.startsWith("org/spike-org/doc/spike-doc/staging/spike-")).toBe(true);
    expect(report.expiresSeconds).toBeLessThanOrEqual(900);
    expect(JSON.stringify(report)).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(report)).not.toMatch(/X-Amz-Signature/i);
  }, 30_000);
});
