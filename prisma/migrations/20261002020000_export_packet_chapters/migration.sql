CREATE TABLE "ExportPacketChapter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportPacketChapter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExportPacketChapter_projectId_contentHash_sourceId_key" ON "ExportPacketChapter"("projectId", "contentHash", "sourceId");
CREATE INDEX "ExportPacketChapter_projectId_fetchedAt_idx" ON "ExportPacketChapter"("projectId", "fetchedAt");

CREATE TABLE "ExportPacketChapterDecision" (
    "chapterId" TEXT NOT NULL,
    "reviewDecisionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "ExportPacketChapterDecision_pkey" PRIMARY KEY ("chapterId", "reviewDecisionId")
);

CREATE UNIQUE INDEX "ExportPacketChapterDecision_chapterId_ordinal_key" ON "ExportPacketChapterDecision"("chapterId", "ordinal");
CREATE INDEX "ExportPacketChapterDecision_reviewDecisionId_idx" ON "ExportPacketChapterDecision"("reviewDecisionId");

ALTER TABLE "ExportPacketChapter" ADD CONSTRAINT "ExportPacketChapter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExportPacketChapterDecision" ADD CONSTRAINT "ExportPacketChapterDecision_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ExportPacketChapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExportPacketChapterDecision" ADD CONSTRAINT "ExportPacketChapterDecision_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
