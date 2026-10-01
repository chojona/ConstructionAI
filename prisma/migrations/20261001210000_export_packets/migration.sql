CREATE TABLE "ExportPacket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "payload" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportPacket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExportPacket_storageKey_key" ON "ExportPacket"("storageKey");
CREATE UNIQUE INDEX "ExportPacket_projectId_contentHash_key" ON "ExportPacket"("projectId", "contentHash");
CREATE INDEX "ExportPacket_projectId_createdAt_idx" ON "ExportPacket"("projectId", "createdAt");

CREATE TABLE "ExportPacketDecision" (
    "exportPacketId" TEXT NOT NULL,
    "reviewDecisionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "ExportPacketDecision_pkey" PRIMARY KEY ("exportPacketId", "reviewDecisionId")
);

CREATE UNIQUE INDEX "ExportPacketDecision_exportPacketId_ordinal_key" ON "ExportPacketDecision"("exportPacketId", "ordinal");
CREATE INDEX "ExportPacketDecision_reviewDecisionId_idx" ON "ExportPacketDecision"("reviewDecisionId");

ALTER TABLE "ExportPacket" ADD CONSTRAINT "ExportPacket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExportPacketDecision" ADD CONSTRAINT "ExportPacketDecision_exportPacketId_fkey" FOREIGN KEY ("exportPacketId") REFERENCES "ExportPacket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExportPacketDecision" ADD CONSTRAINT "ExportPacketDecision_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
