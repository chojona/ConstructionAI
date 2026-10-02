import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DomainError } from "@/lib/domain/errors";
import { resolveStoragePath } from "./storageKey";

export interface ObjectStore {
  readonly mode: "local" | "s3";
  put(storageKey: string, bytes: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export class StorageObjectMissingError extends Error {
  constructor(readonly storageKey: string) {
    super("Stored object is missing.");
    this.name = "StorageObjectMissingError";
  }
}

export class StorageImmutableError extends Error {
  constructor(readonly storageKey: string) {
    super("Stored object already has different bytes.");
    this.name = "StorageImmutableError";
  }
}

export class StorageRequestError extends Error {
  constructor(cause?: unknown) {
    super("Object storage request failed.");
    this.name = "StorageRequestError";
    if (cause !== undefined) this.cause = cause;
  }
}

export class ObjectStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStorageConfigError";
  }
}

export interface ObjectStorageS3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

const CREDENTIALS_MESSAGE = "Set OBJECT_STORAGE_BUCKET or DOCUMENT_STORAGE_BUCKET, plus OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.";
export const STORAGE_UNAVAILABLE_MESSAGE = "Could not store the pack file. Object storage is not configured.";

export type ObjectStorageEnv = Record<string, string | undefined>;

export function localObjectRoot(env: ObjectStorageEnv = process.env) {
  const configured = trimmed(env.OBJECT_STORAGE_DIR) ?? trimmed(env.DOCUMENT_STORAGE_DIR);
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data", "documents");
}

export function readObjectStorageConfig(env: ObjectStorageEnv): ObjectStorageS3Config | null {
  const bucket = first(env.OBJECT_STORAGE_BUCKET, env.DOCUMENT_STORAGE_BUCKET);
  const accessKeyId = first(env.OBJECT_STORAGE_ACCESS_KEY_ID, env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = first(env.OBJECT_STORAGE_SECRET_ACCESS_KEY, env.AWS_SECRET_ACCESS_KEY);
  const endpoint = first(env.OBJECT_STORAGE_ENDPOINT, env.AWS_ENDPOINT_URL_S3);
  const region = first(env.OBJECT_STORAGE_REGION, env.AWS_REGION);
  const forceFlag = trimmed(env.OBJECT_STORAGE_FORCE_PATH_STYLE);
  const configured = Boolean(
    trimmed(env.OBJECT_STORAGE_BUCKET)
    || trimmed(env.DOCUMENT_STORAGE_BUCKET)
    || trimmed(env.OBJECT_STORAGE_ACCESS_KEY_ID)
    || trimmed(env.OBJECT_STORAGE_SECRET_ACCESS_KEY)
    || trimmed(env.OBJECT_STORAGE_ENDPOINT)
    || trimmed(env.AWS_ENDPOINT_URL_S3),
  );
  if (!configured) return null;
  if (!bucket || !accessKeyId || !secretAccessKey) throw new ObjectStorageConfigError(CREDENTIALS_MESSAGE);
  return {
    bucket,
    region: region ?? "us-east-1",
    endpoint,
    forcePathStyle: parseForcePathStyle(forceFlag, Boolean(endpoint)),
    accessKeyId,
    secretAccessKey,
  };
}

export function createObjectStore(env: ObjectStorageEnv = process.env, localRoot = localObjectRoot(env)): ObjectStore {
  const config = readObjectStorageConfig(env);
  if (!config) {
    if (trimmed(env.VERCEL)) {
      throw new ObjectStorageConfigError(
        "Set OBJECT_STORAGE_BUCKET or DOCUMENT_STORAGE_BUCKET with S3 credentials. The hosted filesystem does not keep approved pack or document bytes.",
      );
    }
    return new LocalObjectStore(localRoot);
  }
  return new S3ObjectStore(config);
}

let cached: ObjectStore | undefined;

export function getObjectStore(): ObjectStore {
  cached ??= createObjectStore();
  return cached;
}

/** Opens a store for one environment without caching it. Hosted config failures become a desk error. */
export function openObjectStore(env: ObjectStorageEnv = process.env, localRoot = localObjectRoot(env)): ObjectStore {
  try {
    return createObjectStore(env, localRoot);
  } catch (error) {
    if (error instanceof ObjectStorageConfigError) {
      throw new DomainError("STORAGE_ERROR", STORAGE_UNAVAILABLE_MESSAGE, 503);
    }
    throw error;
  }
}

export function requireObjectStore(): ObjectStore {
  cached ??= openObjectStore();
  return cached;
}

export function objectStoreLabel(store: ObjectStore) {
  if (store instanceof LocalObjectStore) return `local directory ${store.rootDir}`;
  if (store instanceof S3ObjectStore) return `bucket ${store.bucket}`;
  return store.mode;
}

export class LocalObjectStore implements ObjectStore {
  readonly mode = "local" as const;

  constructor(readonly rootDir: string) {}

  async put(storageKey: string, bytes: Buffer) {
    const target = resolveStoragePath(this.rootDir, storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, bytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readFile(target);
      if (!existing.equals(bytes)) throw new StorageImmutableError(storageKey);
    }
  }

  async get(storageKey: string) {
    try {
      return await readFile(resolveStoragePath(this.rootDir, storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageObjectMissingError(storageKey);
      throw error;
    }
  }

  async delete(storageKey: string) {
    await rm(resolveStoragePath(this.rootDir, storageKey), { force: true });
  }

  async exists(storageKey: string) {
    try {
      return (await stat(resolveStoragePath(this.rootDir, storageKey))).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}

export class S3ObjectStore implements ObjectStore {
  readonly mode = "s3" as const;
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ObjectStorageS3Config, client?: S3Client) {
    this.bucket = config.bucket;
    this.client = client ?? new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(storageKey: string, bytes: Buffer) {
    const key = objectKey(storageKey);
    const hash = sha256(bytes);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      const existingHash = head.Metadata?.["content-sha256"];
      if (existingHash && existingHash !== hash) throw new StorageImmutableError(storageKey);
      if (!existingHash && head.ContentLength !== bytes.byteLength) throw new StorageImmutableError(storageKey);
      return;
    } catch (error) {
      if (error instanceof StorageImmutableError) throw error;
      if (!isMissingObject(error)) throw new StorageRequestError(error);
    }
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        Metadata: { "content-sha256": hash },
      }));
    } catch (error) {
      throw new StorageRequestError(error);
    }
  }

  async get(storageKey: string) {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(storageKey) }));
      if (!response.Body) throw new StorageObjectMissingError(storageKey);
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof StorageObjectMissingError) throw error;
      if (isMissingObject(error)) throw new StorageObjectMissingError(storageKey);
      throw new StorageRequestError(error);
    }
  }

  async delete(storageKey: string) {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey(storageKey) }));
    } catch (error) {
      throw new StorageRequestError(error);
    }
  }

  async exists(storageKey: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey(storageKey) }));
      return true;
    } catch (error) {
      if (isMissingObject(error)) return false;
      throw new StorageRequestError(error);
    }
  }

  async signedReadUrl(storageKey: string, expiresInSeconds = 120) {
    const expiresIn = expiresInSeconds;
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) {
      throw new ObjectStorageConfigError("Signed read expiry must be between 1 and 3600 seconds.");
    }
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(storageKey) }),
        { expiresIn },
      );
    } catch (error) {
      throw new StorageRequestError(error);
    }
  }
}

function objectKey(storageKey: string) {
  resolveStoragePath("/object-storage-root", storageKey);
  return storageKey;
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
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

function parseForcePathStyle(value: string | undefined, endpointSet: boolean) {
  if (!value) return endpointSet;
  const normalized = value.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new ObjectStorageConfigError("OBJECT_STORAGE_FORCE_PATH_STYLE must be true or false.");
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return record.name === "NotFound" || record.name === "NoSuchKey" || record.$metadata?.httpStatusCode === 404;
}
