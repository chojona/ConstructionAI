import path from "node:path";

export class StoragePathError extends Error {
  constructor(message = "Invalid document storage path") {
    super(message);
    this.name = "StoragePathError";
  }
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
