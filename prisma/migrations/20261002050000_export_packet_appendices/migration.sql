ALTER TABLE "ExportPacketChapter" ADD COLUMN "pageCites" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DROP INDEX "ExportPacketChapter_projectId_contentHash_sourceId_key";

CREATE UNIQUE INDEX "ExportPacketChapter_projectId_contentHash_sourceId_role_key" ON "ExportPacketChapter"("projectId", "contentHash", "sourceId", "role");
