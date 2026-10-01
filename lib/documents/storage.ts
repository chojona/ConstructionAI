import { randomUUID } from "node:crypto";
import path from "node:path";
import { LocalObjectStore, requireObjectStore, type ObjectStore } from "@/lib/storage/objectStore";
import { StoragePathError } from "@/lib/storage/storageKey";

export { resolveStoragePath, StoragePathError } from "@/lib/storage/storageKey";

export interface StoredDocument {
  storageKey: string;
}

export interface DocumentStorage {
  put(input: { documentId: string; bytes: Buffer }): Promise<StoredDocument>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Display metadata only. The result is never used as a filesystem path. */
export function displayFilename(original: string): string {
  const base = original.split(/[/\\]/).pop() ?? "document.pdf";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return (cleaned || "document.pdf").slice(0, 240);
}

class KeyedDocumentStorage implements DocumentStorage {
  constructor(private readonly objects: ObjectStore) {}

  async put(input: { documentId: string; bytes: Buffer }): Promise<StoredDocument> {
    if (!DOCUMENT_ID_PATTERN.test(input.documentId)) throw new StoragePathError("Invalid document id");
    const storageKey = `${input.documentId}/${randomUUID()}.pdf`;
    await this.objects.put(storageKey, input.bytes);
    return { storageKey };
  }

  get(storageKey: string) {
    return this.objects.get(storageKey);
  }

  delete(storageKey: string) {
    return this.objects.delete(storageKey);
  }

  exists(storageKey: string) {
    return this.objects.exists(storageKey);
  }
}

export class LocalDocumentStorage extends KeyedDocumentStorage {
  constructor(rootDir: string) {
    super(new LocalObjectStore(rootDir));
  }
}

export function defaultDocumentStorageRoot(): string {
  const configured = process.env.DOCUMENT_STORAGE_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data", "documents");
}

let defaultStorage: DocumentStorage | undefined;

export function getDocumentStorage(): DocumentStorage {
  defaultStorage ??= new KeyedDocumentStorage(requireObjectStore());
  return defaultStorage;
}
