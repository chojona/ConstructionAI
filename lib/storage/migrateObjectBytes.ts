import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { writePacketBytes } from "./packetBytes";
import type { ObjectStore } from "./objectStore";
import { resolveStoragePath, StoragePathError } from "./storageKey";

export async function migrateExportPacketPayloads(
  db: PrismaClient,
  objects: ObjectStore,
  filter: { projectId?: string } = {},
) {
  const rows = await db.exportPacket.findMany({
    where: {
      payload: { not: null },
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
    },
    select: { id: true, storageKey: true, payload: true, byteSize: true },
  });
  let copied = 0;
  for (const row of rows) {
    if (!row.payload) continue;
    const payload = Buffer.from(row.payload);
    if (payload.byteLength !== row.byteSize) {
      throw new Error(`Approved pack ${row.id} byte size does not match its payload.`);
    }
    await writePacketBytes(objects, row.storageKey, payload);
    await db.exportPacket.update({ where: { id: row.id }, data: { payload: null } });
    copied += 1;
  }
  return { copied };
}

export async function copyLocalRevisionFiles(input: {
  storageKeys: readonly string[];
  localRoot: string;
  objects: ObjectStore;
}) {
  let copied = 0;
  let missing = 0;
  let alreadyStored = 0;
  let rejected = 0;
  for (const storageKey of input.storageKeys) {
    let source: string;
    try {
      source = resolveStoragePath(input.localRoot, storageKey);
    } catch (error) {
      if (error instanceof StoragePathError) {
        rejected += 1;
        continue;
      }
      throw error;
    }
    if (await input.objects.exists(storageKey)) {
      alreadyStored += 1;
      continue;
    }
    try {
      await input.objects.put(storageKey, await readFile(source));
      copied += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        missing += 1;
        continue;
      }
      throw error;
    }
  }
  return { copied, missing, alreadyStored, rejected };
}
