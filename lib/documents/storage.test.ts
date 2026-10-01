import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { displayFilename, LocalDocumentStorage, resolveStoragePath, StoragePathError } from "./storage";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("local document storage", () => {
  it("generates safe opaque keys and round-trips bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "construction-storage-")); roots.push(root);
    const storage = new LocalDocumentStorage(root);
    const stored = await storage.put({ documentId: "doc_123", bytes: Buffer.from("source") });
    expect(stored.storageKey).toMatch(/^doc_123\/[0-9a-f-]+\.pdf$/);
    expect(await storage.get(stored.storageKey)).toEqual(Buffer.from("source"));
    expect(await readdir(path.join(root, "doc_123"))).toHaveLength(1);
  });

  it("rejects traversal storage keys", () => {
    expect(() => resolveStoragePath("/tmp/safe-root", "../escape.pdf")).toThrow(StoragePathError);
    expect(() => resolveStoragePath("/tmp/safe-root", "/etc/passwd")).toThrow(StoragePathError);
  });

  it("rejects document ids containing path segments", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "construction-storage-")); roots.push(root);
    await expect(new LocalDocumentStorage(root).put({ documentId: "../escape", bytes: Buffer.from("x") })).rejects.toBeInstanceOf(StoragePathError);
  });

  it("reduces malicious filenames to safe display metadata", () => {
    expect(displayFilename("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(displayFilename("..\\..\\secret.pdf")).toBe("secret.pdf");
  });
});
