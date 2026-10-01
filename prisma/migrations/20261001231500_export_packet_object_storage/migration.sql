-- Approved pack bytes move to object storage.
-- Existing BYTEA stays until `npm run storage:migrate-packets` copies each payload and clears the column.
ALTER TABLE "ExportPacket" ALTER COLUMN "payload" DROP NOT NULL;
