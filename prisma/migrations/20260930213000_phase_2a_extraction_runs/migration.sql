CREATE TYPE "ExtractionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SUPERSEDED');

CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "documentRevisionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "extractorName" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ExtractionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExtractionRun_documentRevisionId_createdAt_idx" ON "ExtractionRun"("documentRevisionId", "createdAt");
CREATE UNIQUE INDEX "ExtractionRun_documentRevisionId_attemptNumber_key" ON "ExtractionRun"("documentRevisionId", "attemptNumber");

ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_documentRevisionId_fkey" FOREIGN KEY ("documentRevisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
