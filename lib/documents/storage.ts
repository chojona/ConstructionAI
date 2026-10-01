import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredDocument {
  storageKey: string;
}

export interface DocumentStorage {
  put(input: { documentId: string; bytes: Buffer }): Promise<StoredDocument>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class StoragePathError extends Error {
  constructor(message = "Invalid document storage path") {
    super(message);
    this.name = "StoragePathError";
  }
}

/** Display metadata only. The result is never used as a filesystem path. */
export function displayFilename(original: string): string {
  const base = original.split(/[/\\]/).pop() ?? "document.pdf";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return (cleaned || "document.pdf").slice(0, 240);
}

export function resolveStoragePath(rootDir: string, storageKey: string): string {
  if (!storageKey || storageKey.includes("\0") || path.isAbsolute(storageKey)) {
    throw new StoragePathError();
  }
  const segments = storageKey.split(/[/\\]/);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new StoragePathError();
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, ...segments);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new StoragePathError();
  return resolved;
}

export class LocalDocumentStorage implements DocumentStorage {
  constructor(private readonly rootDir: string) {}

  async put(input: { documentId: string; bytes: Buffer }): Promise<StoredDocument> {
    if (!DOCUMENT_ID_PATTERN.test(input.documentId)) throw new StoragePathError("Invalid document id");
    const storageKey = `${input.documentId}/${randomUUID()}.pdf`;
    const target = resolveStoragePath(this.rootDir, storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.bytes, { flag: "wx" });
    return { storageKey };
  }

  get(storageKey: string) {
    return readFile(resolveStoragePath(this.rootDir, storageKey));
  }

  async delete(storageKey: string) {
    await rm(resolveStoragePath(this.rootDir, storageKey), { force: true });
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      return (await stat(resolveStoragePath(this.rootDir, storageKey))).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}

export function defaultDocumentStorageRoot(): string {
  const configured = process.env.DOCUMENT_STORAGE_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data", "documents");
}

let defaultStorage: LocalDocumentStorage | undefined;
export function getDocumentStorage(): DocumentStorage {
  defaultStorage ??= new LocalDocumentStorage(defaultDocumentStorageRoot());
  return defaultStorage;
}
