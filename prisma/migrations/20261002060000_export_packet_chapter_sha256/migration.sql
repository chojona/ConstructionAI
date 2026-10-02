-- One row per sha256 within a project and role. Keep the first write's provenance.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "projectId", "contentHash", "role"
           ORDER BY "createdAt" ASC, "id" ASC
         ) AS rn
  FROM "ExportPacketChapter"
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM "ExportPacketChapterDecision"
WHERE "chapterId" IN (SELECT id FROM duplicates);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "projectId", "contentHash", "role"
           ORDER BY "createdAt" ASC, "id" ASC
         ) AS rn
  FROM "ExportPacketChapter"
)
DELETE FROM "ExportPacketChapter"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DROP INDEX "ExportPacketChapter_projectId_contentHash_sourceId_role_key";

CREATE UNIQUE INDEX "ExportPacketChapter_projectId_contentHash_role_key"
  ON "ExportPacketChapter"("projectId", "contentHash", "role");
