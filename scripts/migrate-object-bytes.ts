import { createPrismaClient } from "../lib/db";
import { defaultDocumentStorageRoot } from "../lib/documents/storage";
import { copyLocalRevisionFiles, migrateExportPacketPayloads } from "../lib/storage/migrateObjectBytes";
import { getObjectStore, objectStoreLabel } from "../lib/storage/objectStore";

const objects = getObjectStore();
const db = createPrismaClient();

try {
  const packets = await migrateExportPacketPayloads(db, objects);
  const revisions = await db.documentRevision.findMany({ select: { storageKey: true } });
  const documents = await copyLocalRevisionFiles({
    storageKeys: revisions.map((revision) => revision.storageKey),
    localRoot: defaultDocumentStorageRoot(),
    objects,
  });
  console.log(`Object storage: ${objectStoreLabel(objects)}`);
  console.log(`Approved packs copied: ${packets.copied}`);
  console.log(`Document files copied: ${documents.copied}; already stored: ${documents.alreadyStored}; not on local disk: ${documents.missing}; rejected keys: ${documents.rejected}`);
} finally {
  await db.$disconnect();
}
