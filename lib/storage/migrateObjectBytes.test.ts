import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyLocalRevisionFiles } from "./migrateObjectBytes";
import { LocalObjectStore } from "./objectStore";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("local revision copy", () => {
  it("copies files that are not already stored and leaves stored bytes unchanged", async () => {
    const source = await mkdtemp(path.join(tmpdir(), "revision-source-"));
    const dest = await mkdtemp(path.join(tmpdir(), "revision-dest-"));
    roots.push(source, dest);
    await mkdir(path.join(source, "doc_1"), { recursive: true });
    await writeFile(path.join(source, "doc_1", "a.pdf"), "pdf-a");
    await writeFile(path.join(source, "doc_1", "b.pdf"), "new-b");
    const objects = new LocalObjectStore(dest);
    await objects.put("doc_1/b.pdf", Buffer.from("stored-b"));

    const result = await copyLocalRevisionFiles({
      storageKeys: ["doc_1/a.pdf", "doc_1/b.pdf", "doc_1/missing.pdf", "../escape.pdf"],
      localRoot: source,
      objects,
    });
    expect(result).toEqual({ copied: 1, missing: 1, alreadyStored: 1, rejected: 1 });
    expect(await readFile(path.join(dest, "doc_1", "a.pdf"), "utf8")).toBe("pdf-a");
    expect(await objects.get("doc_1/b.pdf")).toEqual(Buffer.from("stored-b"));
  });
});