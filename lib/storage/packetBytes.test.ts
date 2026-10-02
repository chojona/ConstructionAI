import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStore, type ObjectStore } from "./objectStore";
import { packetBytesToStore, readPacketBytes, writePacketBytes } from "./packetBytes";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("approved pack bytes", () => {
  it("reads the object, then a legacy database payload, and refuses a different object", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "packet-bytes-"));
    roots.push(root);
    const objects = new LocalObjectStore(root);
    const legacy = Buffer.from("{\"kind\":\"approved-change-packet\"}");
    await expect(readPacketBytes({
      objects,
      storageKey: "export-packets/p/hash.json",
      legacyPayload: legacy,
      byteSize: legacy.byteLength,
    })).resolves.toEqual(legacy);

    await writePacketBytes(objects, "export-packets/p/hash.json", legacy);
    await expect(readPacketBytes({
      objects,
      storageKey: "export-packets/p/hash.json",
      legacyPayload: null,
      byteSize: legacy.byteLength,
    })).resolves.toEqual(legacy);
    await writePacketBytes(objects, "export-packets/p/hash.json", legacy);
    await expect(writePacketBytes(objects, "export-packets/p/hash.json", Buffer.from("different-pack-bytes"))).rejects.toMatchObject({
      code: "STORAGE_ERROR",
    });
    await expect(readPacketBytes({
      objects,
      storageKey: "export-packets/missing.json",
      legacyPayload: null,
      byteSize: 4,
    })).rejects.toMatchObject({ code: "STORAGE_ERROR", message: "Approved pack bytes are missing." });
    expect(packetBytesToStore(legacy, legacy, legacy.byteLength).equals(legacy)).toBe(true);
    expect(() => packetBytesToStore(Buffer.from("other-approved-pack"), legacy, legacy.byteLength)).toThrow(Error);
  });

  it("turns an object-store write failure into a desk storage error", async () => {
    const objects: ObjectStore = {
      mode: "s3",
      async put() {
        throw new Error("AccessDenied");
      },
      async get() {
        throw new Error("AccessDenied");
      },
      async delete() {},
      async exists() {
        return false;
      },
    };
    await expect(writePacketBytes(objects, "export-packets/project/appendices/abc.pdf", Buffer.from("%PDF-1.4"))).rejects.toMatchObject({
      code: "STORAGE_ERROR",
      httpStatus: 503,
      message: "Could not store the pack file.",
    });
  });
});
