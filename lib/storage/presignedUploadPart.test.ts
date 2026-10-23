import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import {
  looksLikeProductionName,
  readSpikeStorageConfig,
  redactSecrets,
  runPresignedPartLengthProbe,
  spikeRefusalReason,
  spikeUploadPartKey,
  SpikeStorageRefused,
  type SpikeEnv,
} from "./presignedPartLengthProbe";
import {
  PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS,
  PresignedUploadPartError,
  signUploadPartUrl,
  uploadPartChecksumSha256Supported,
} from "./presignedUploadPart";

const ioProbe = vi.hoisted(() => ({
  s3Clients: 0,
  s3Sends: 0,
  httpRequests: 0,
  httpsRequests: 0,
  s3Endpoints: [] as string[],
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  const S3Client = new Proxy(actual.S3Client, {
    construct(target, args, newTarget) {
      ioProbe.s3Clients += 1;
      const options = args[0] as { endpoint?: unknown } | undefined;
      if (typeof options?.endpoint === "string") ioProbe.s3Endpoints.push(options.endpoint);
      const client = Reflect.construct(target, args, newTarget) as InstanceType<typeof actual.S3Client>;
      const send = client.send.bind(client);
      client.send = ((...sendArgs: Parameters<typeof client.send>) => {
        ioProbe.s3Sends += 1;
        if (!process.env.SPIKE_BUCKET) throw new Error("S3 send disabled in unit tests");
        return send(...sendArgs);
      }) as typeof client.send;
      return client;
    },
  });
  return { ...actual, S3Client };
});

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  const request = ((...args: Parameters<typeof actual.request>) => {
    ioProbe.httpRequests += 1;
    if (!process.env.SPIKE_BUCKET) throw new Error("HTTP disabled in unit tests");
    return actual.request(...args);
  }) as typeof actual.request;
  return { ...actual, request };
});

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  const request = ((...args: Parameters<typeof actual.request>) => {
    ioProbe.httpsRequests += 1;
    if (!process.env.SPIKE_BUCKET) throw new Error("HTTPS disabled in unit tests");
    return actual.request(...args);
  }) as typeof actual.request;
  return { ...actual, request };
});

const KEY = "org/spike-org/doc/spike-doc/staging/spike-intent-0123456789.pdf";
const PRODUCTION_BRANCH_ID = "br-plain-dawn-b56i00z1";

function without(env: SpikeEnv, key: string): SpikeEnv {
  const copy: SpikeEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (name !== key) copy[name] = value;
  }
  return copy;
}

function ioSnapshot() {
  return {
    s3Clients: ioProbe.s3Clients,
    s3Sends: ioProbe.s3Sends,
    httpRequests: ioProbe.httpRequests,
    httpsRequests: ioProbe.httpsRequests,
    s3Endpoints: ioProbe.s3Endpoints.length,
  };
}

async function expectRefusedBeforeAnyIo(env: SpikeEnv, message: RegExp) {
  const before = ioSnapshot();
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch disabled in unit tests"));
  try {
    expect(spikeRefusalReason(env)).toMatch(message);
    await expect(runPresignedPartLengthProbe(env)).rejects.toBeInstanceOf(SpikeStorageRefused);
    await expect(runPresignedPartLengthProbe(env)).rejects.toThrow(message);
    expect(ioSnapshot()).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
}

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
  const endpoint = "https://br-calm-leaf.storage.c-7.us-east-2.aws.neon.tech";
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
    expect(spikeRefusalReason({ ...ready, SPIKE_ENDPOINT: "https://bucket.s3.amazonaws.com", AWS_ENDPOINT_URL_S3: "https://bucket.s3.amazonaws.com" })).toMatch(/not a Neon branch storage host/);
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

  it("uses SPIKE_BUCKET and the explicit region rather than the app bucket or us-east-1", () => {
    expect(readSpikeStorageConfig(ready)).toMatchObject({
      bucket: "branch-spike",
      endpoint: new URL(endpoint).origin,
      region: "us-east-1",
      forcePathStyle: true,
      accessKeyId: "spike-key",
    });
    expect(readSpikeStorageConfig({ ...without(ready, "AWS_REGION"), SPIKE_REGION: "us-east-2" })).toMatchObject({
      bucket: "branch-spike",
      region: "us-east-2",
    });
    expect(spikeUploadPartKey("spike-intent-0123456789")).toBe(KEY);
    expect(() => readSpikeStorageConfig({ ...ready, SPIKE_BUCKET: "" })).toThrow(SpikeStorageRefused);
  });

  it("refuses a percent-encoded production host before any client or network call", async () => {
    const poisoned = `https://br%2Dplain-dawn-b56i00z1.storage.c-7.us-east-2.aws.neon.tech`;
    await expectRefusedBeforeAnyIo(
      { ...ready, SPIKE_ENDPOINT: poisoned, AWS_ENDPOINT_URL_S3: poisoned },
      /SPIKE_ENDPOINT contains percent-encoding or a non-ASCII character/,
    );
    await expectRefusedBeforeAnyIo(
      { ...ready, AWS_ENDPOINT_URL_S3: poisoned },
      /AWS_ENDPOINT_URL_S3 contains percent-encoding or a non-ASCII character/,
    );
    await expectRefusedBeforeAnyIo(
      { ...ready, OBJECT_STORAGE_ENDPOINT: poisoned },
      /OBJECT_STORAGE_ENDPOINT contains percent-encoding or a non-ASCII character/,
    );
  });

  it("refuses a full-width production host before any client or network call", async () => {
    const poisoned = `https://\uFF42\uFF52-plain-dawn-b56i00z1.storage.c-7.us-east-2.aws.neon.tech`;
    await expectRefusedBeforeAnyIo(
      { ...ready, SPIKE_ENDPOINT: poisoned, AWS_ENDPOINT_URL_S3: poisoned },
      /SPIKE_ENDPOINT contains percent-encoding or a non-ASCII character/,
    );
    await expectRefusedBeforeAnyIo(
      { ...ready, AWS_ENDPOINT_URL_S3: poisoned },
      /AWS_ENDPOINT_URL_S3 contains percent-encoding or a non-ASCII character/,
    );
    await expectRefusedBeforeAnyIo(
      { ...ready, OBJECT_STORAGE_ENDPOINT: poisoned },
      /OBJECT_STORAGE_ENDPOINT contains percent-encoding or a non-ASCII character/,
    );
  });

  it("refuses an uppercase production host before any client or network call", async () => {
    const poisoned = `https://${PRODUCTION_BRANCH_ID.toUpperCase()}.storage.c-7.us-east-2.aws.neon.tech`;
    await expectRefusedBeforeAnyIo(
      { ...ready, SPIKE_ENDPOINT: poisoned, AWS_ENDPOINT_URL_S3: poisoned },
      /SPIKE_ENDPOINT contains the production Neon branch/,
    );
    await expectRefusedBeforeAnyIo(
      { ...ready, AWS_ENDPOINT_URL_S3: poisoned },
      /AWS_ENDPOINT_URL_S3 contains the production Neon branch/,
    );
    await expectRefusedBeforeAnyIo(
      { ...ready, OBJECT_STORAGE_ENDPOINT: poisoned },
      /OBJECT_STORAGE_ENDPOINT contains the production Neon branch/,
    );
  });

  it("constructs the S3 client with the parsed origin", async () => {
    const raw = `${endpoint}/`;
    const origin = new URL(endpoint).origin;
    expect(raw).not.toBe(origin);
    expect(readSpikeStorageConfig({ ...ready, SPIKE_ENDPOINT: raw, AWS_ENDPOINT_URL_S3: raw }).endpoint).toBe(origin);
    const before = ioSnapshot();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch disabled in unit tests"));
    try {
      const report = await runPresignedPartLengthProbe({
        ...ready,
        SPIKE_ENDPOINT: raw,
        AWS_ENDPOINT_URL_S3: raw,
      });
      expect(report.endpointHost).toBe(new URL(origin).hostname);
      expect(ioProbe.s3Clients).toBe(before.s3Clients + 1);
      expect(ioProbe.s3Endpoints.at(-1)).toBe(origin);
      expect(ioProbe.httpRequests).toBe(before.httpRequests);
      expect(ioProbe.httpsRequests).toBe(before.httpsRequests);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("refuses the production bucket uploads in SPIKE_BUCKET before any client or network call", async () => {
    await expectRefusedBeforeAnyIo(
      { ...ready, SPIKE_BUCKET: " uploads " },
      /SPIKE_BUCKET is the production bucket uploads/,
    );
    expect(spikeRefusalReason({ ...ready, SPIKE_BUCKET: "uploads-archive" })).toBeNull();
  });

  it("refuses the production bucket uploads in OBJECT_STORAGE_BUCKET before any client or network call", async () => {
    await expectRefusedBeforeAnyIo(
      { ...ready, OBJECT_STORAGE_BUCKET: "uploads" },
      /OBJECT_STORAGE_BUCKET is the production bucket uploads/,
    );
  });

  it("refuses the production bucket uploads in DOCUMENT_STORAGE_BUCKET before any client or network call", async () => {
    await expectRefusedBeforeAnyIo(
      { ...ready, DOCUMENT_STORAGE_BUCKET: "\tuploads\n" },
      /DOCUMENT_STORAGE_BUCKET is the production bucket uploads/,
    );
  });

  it("refuses uploads. before any client or network call", async () => {
    await expectRefusedBeforeAnyIo({ ...ready, SPIKE_BUCKET: "uploads." }, /SPIKE_BUCKET is not a strict S3 bucket name/);
    await expectRefusedBeforeAnyIo({ ...ready, OBJECT_STORAGE_BUCKET: "uploads." }, /OBJECT_STORAGE_BUCKET is not a strict S3 bucket name/);
    await expectRefusedBeforeAnyIo({ ...ready, DOCUMENT_STORAGE_BUCKET: "uploads." }, /DOCUMENT_STORAGE_BUCKET is not a strict S3 bucket name/);
  });

  it("refuses uploads?x before any client or network call", async () => {
    await expectRefusedBeforeAnyIo({ ...ready, SPIKE_BUCKET: "uploads?x" }, /SPIKE_BUCKET is not a strict S3 bucket name/);
    await expectRefusedBeforeAnyIo({ ...ready, OBJECT_STORAGE_BUCKET: "uploads?x" }, /OBJECT_STORAGE_BUCKET is not a strict S3 bucket name/);
    await expectRefusedBeforeAnyIo({ ...ready, DOCUMENT_STORAGE_BUCKET: "uploads?x" }, /DOCUMENT_STORAGE_BUCKET is not a strict S3 bucket name/);
  });

  it("refuses a missing SPIKE_STORAGE_ENV before any client or network call", async () => {
    await expectRefusedBeforeAnyIo(without(ready, "SPIKE_STORAGE_ENV"), /SPIKE_STORAGE_ENV=nonprod/);
  });

  it("refuses a SPIKE_STORAGE_ENV other than nonprod before any client or network call", async () => {
    await expectRefusedBeforeAnyIo({ ...ready, SPIKE_STORAGE_ENV: "production" }, /SPIKE_STORAGE_ENV=nonprod/);
    await expectRefusedBeforeAnyIo({ ...ready, SPIKE_STORAGE_ENV: "NONPROD" }, /SPIKE_STORAGE_ENV=nonprod/);
    await expectRefusedBeforeAnyIo({ ...ready, SPIKE_STORAGE_ENV: " nonprod" }, /SPIKE_STORAGE_ENV=nonprod/);
  });

  it("refuses a missing region before any client or network call", async () => {
    const withoutRegion = without(ready, "AWS_REGION");
    await expectRefusedBeforeAnyIo(withoutRegion, /set AWS_REGION or SPIKE_REGION/);
    await expectRefusedBeforeAnyIo({ ...ready, AWS_REGION: "   " }, /does not default to us-east-1/);
    await expectRefusedBeforeAnyIo(
      { ...withoutRegion, OBJECT_STORAGE_REGION: "us-east-1" },
      /does not default to us-east-1/,
    );
    expect(() => readSpikeStorageConfig(withoutRegion)).toThrow(SpikeStorageRefused);
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
