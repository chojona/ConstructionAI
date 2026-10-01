import { DomainError } from "@/lib/domain/errors";
import { StorageObjectMissingError, type ObjectStore } from "./objectStore";

const MISSING = "Approved pack bytes are missing.";
const MISMATCH = "Approved pack object does not match its stored bytes.";

export function packetBytesToStore(legacyPayload: Uint8Array | null, payload: Buffer, byteSize: number) {
  if (payload.byteLength !== byteSize) {
    throw new DomainError("STORAGE_ERROR", "Approved pack bytes do not match the stored size.", 500);
  }
  if (!legacyPayload) return payload;
  const legacy = Buffer.from(legacyPayload);
  if (legacy.byteLength !== byteSize || !legacy.equals(payload)) {
    throw new DomainError("STORAGE_ERROR", MISMATCH, 500);
  }
  return legacy;
}

export async function readPacketBytes(input: {
  objects: ObjectStore;
  storageKey: string;
  legacyPayload: Uint8Array | null;
  byteSize: number;
}): Promise<Buffer> {
  const objectBytes = await readIfPresent(input.objects, input.storageKey);
  if (objectBytes && objectBytes.byteLength === input.byteSize) return objectBytes;
  if (input.legacyPayload && input.legacyPayload.byteLength === input.byteSize) return Buffer.from(input.legacyPayload);
  throw new DomainError("STORAGE_ERROR", MISSING, 500);
}

export async function writePacketBytes(objects: ObjectStore, storageKey: string, payload: Buffer) {
  const existing = await readIfPresent(objects, storageKey);
  if (existing) {
    if (!existing.equals(payload)) throw new DomainError("STORAGE_ERROR", MISMATCH, 500);
    return;
  }
  await objects.put(storageKey, payload);
  const stored = await objects.get(storageKey);
  if (!stored.equals(payload)) throw new DomainError("STORAGE_ERROR", MISMATCH, 500);
}

async function readIfPresent(objects: ObjectStore, storageKey: string) {
  try {
    return await objects.get(storageKey);
  } catch (error) {
    if (error instanceof StorageObjectMissingError) return null;
    throw error;
  }
}
