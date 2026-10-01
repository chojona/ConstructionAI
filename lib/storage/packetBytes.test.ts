import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStore } from "./objectStore";
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
});
