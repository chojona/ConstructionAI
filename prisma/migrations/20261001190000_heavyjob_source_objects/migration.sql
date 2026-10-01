CREATE TYPE "HeavyJobObjectType" AS ENUM ('timecard', 'cost_code', 'quantity', 'diary', 'attachment');

CREATE TABLE "HeavyJobSourceObject" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "objectType" "HeavyJobObjectType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeavyJobSourceObject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HeavyJobSourceObject_projectId_objectType_fetchedAt_idx" ON "HeavyJobSourceObject"("projectId", "objectType", "fetchedAt");
CREATE UNIQUE INDEX "HeavyJobSourceObject_projectId_objectType_sourceId_fetchedAt_key" ON "HeavyJobSourceObject"("projectId", "objectType", "sourceId", "fetchedAt");

ALTER TABLE "HeavyJobSourceObject" ADD CONSTRAINT "HeavyJobSourceObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
