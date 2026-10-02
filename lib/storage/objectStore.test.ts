import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import {
  createObjectStore,
  LocalObjectStore,
  ObjectStorageConfigError,
  openObjectStore,
  readObjectStorageConfig,
  S3ObjectStore,
  STORAGE_UNAVAILABLE_MESSAGE,
  StorageImmutableError,
  StorageObjectMissingError,
} from "./objectStore";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("object storage", () => {
  it("round-trips local bytes and refuses a different overwrite", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "object-store-"));
    roots.push(root);
    const store = new LocalObjectStore(root);
    await store.put("export-packets/project/abc.json", Buffer.from("pack"));
    expect(await store.get("export-packets/project/abc.json")).toEqual(Buffer.from("pack"));
    await store.put("export-packets/project/abc.json", Buffer.from("pack"));
    await expect(store.put("export-packets/project/abc.json", Buffer.from("other"))).rejects.toBeInstanceOf(StorageImmutableError);
    await expect(store.get("../escape")).rejects.toBeInstanceOf(Error);
    await store.delete("export-packets/project/abc.json");
    await expect(store.get("export-packets/project/abc.json")).rejects.toBeInstanceOf(StorageObjectMissingError);
  });

  it("uses local disk until bucket credentials are complete", () => {
    expect(readObjectStorageConfig({})).toBeNull();
    expect(readObjectStorageConfig({ OBJECT_STORAGE_REGION: "us-east-1", OBJECT_STORAGE_BUCKET: "" })).toBeNull();
    expect(createObjectStore({}, "/tmp/packs").mode).toBe("local");
    expect(() => readObjectStorageConfig({ OBJECT_STORAGE_BUCKET: "packs" })).toThrow(ObjectStorageConfigError);
    expect(() => readObjectStorageConfig({ OBJECT_STORAGE_ENDPOINT: "https://example.test" })).toThrow(ObjectStorageConfigError);
    expect(() => readObjectStorageConfig({
      OBJECT_STORAGE_BUCKET: "packs",
      OBJECT_STORAGE_ACCESS_KEY_ID: "key",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret",
      OBJECT_STORAGE_FORCE_PATH_STYLE: "maybe",
    })).toThrow(/true or false/);
    expect(() => createObjectStore({ VERCEL: "1" }, "/tmp/packs")).toThrow(/hosted filesystem/);
    expect(() => openObjectStore({ VERCEL: "1" }, "/tmp/packs")).toThrow(expect.objectContaining({
      code: "STORAGE_ERROR",
      httpStatus: 503,
      message: STORAGE_UNAVAILABLE_MESSAGE,
    }));
  });

  it("uses the preview document bucket when OBJECT_STORAGE_* is unset", () => {
    const store = createObjectStore({
      VERCEL: "1",
      DOCUMENT_STORAGE_BUCKET: "preview-packs",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ENDPOINT_URL_S3: "https://example.test",
    });
    expect(store).toBeInstanceOf(S3ObjectStore);
    expect(store.mode).toBe("s3");
    expect((store as S3ObjectStore).bucket).toBe("preview-packs");
    const config = readObjectStorageConfig({
      VERCEL: "1",
      OBJECT_STORAGE_BUCKET: "",
      DOCUMENT_STORAGE_BUCKET: "preview-packs",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ENDPOINT_URL_S3: "https://s3.example.test",
    });
    expect(config).toMatchObject({
      bucket: "preview-packs",
      endpoint: "https://s3.example.test",
      region: "us-east-1",
      forcePathStyle: true,
    });
  });

  it("builds an S3 store when bucket credentials are set", () => {
    const config = readObjectStorageConfig({
      OBJECT_STORAGE_BUCKET: "packs",
      OBJECT_STORAGE_ACCESS_KEY_ID: "key",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret",
      OBJECT_STORAGE_ENDPOINT: "https://example.test",
      OBJECT_STORAGE_REGION: "auto",
    });
    expect(config).toMatchObject({
      bucket: "packs",
      region: "auto",
      endpoint: "https://example.test",
      forcePathStyle: true,
    });
    expect(createObjectStore({
      OBJECT_STORAGE_BUCKET: "packs",
      OBJECT_STORAGE_ACCESS_KEY_ID: "key",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret",
      OBJECT_STORAGE_FORCE_PATH_STYLE: "false",
    }).mode).toBe("s3");
  });

  it("puts and reads S3 bytes without replacing a different object", async () => {
    const objects = new Map<string, { bytes: Buffer; hash?: string }>();
    const client = {
      async send(command: { constructor: { name: string }; input: { Key?: string; Body?: Buffer; Metadata?: Record<string, string> } }) {
        const key = command.input.Key ?? "";
        if (command instanceof HeadObjectCommand) {
          const found = objects.get(key);
          if (!found) throw Object.assign(new Error("missing"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
          return { ContentLength: found.bytes.byteLength, Metadata: found.hash ? { "content-sha256": found.hash } : {} };
        }
        if (command instanceof PutObjectCommand) {
          const body = Buffer.from(command.input.Body ?? []);
          objects.set(key, { bytes: body, hash: command.input.Metadata?.["content-sha256"] });
          return {};
        }
        const found = objects.get(key);
        if (!found) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
        return { Body: { transformToByteArray: async () => new Uint8Array(found.bytes) } };
      },
    } as unknown as S3Client;
    const store = new S3ObjectStore({
      bucket: "packs",
      region: "us-east-1",
      forcePathStyle: false,
      accessKeyId: "key",
      secretAccessKey: "secret",
    }, client);
    await store.put("export-packets/project/abc.json", Buffer.from("pack"));
    expect(await store.get("export-packets/project/abc.json")).toEqual(Buffer.from("pack"));
    await store.put("export-packets/project/abc.json", Buffer.from("pack"));
    await expect(store.put("export-packets/project/abc.json", Buffer.from("other"))).rejects.toBeInstanceOf(StorageImmutableError);
    expect(await store.exists("export-packets/project/abc.json")).toBe(true);
    expect(await store.exists("export-packets/missing.json")).toBe(false);
  });

  it("keeps hashing and object storage off the client components", () => {
    const client = ["components/review/draft-email.tsx", "components/review/export-packet.tsx"]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(client).not.toMatch(/node:crypto|@\/lib\/storage\/objectStore|@aws-sdk\/client-s3/);
  });
});
