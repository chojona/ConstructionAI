-- CreateEnum
CREATE TYPE "UploadIntentStatus" AS ENUM ('PENDING', 'FINALIZED', 'ABORTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "revisionLabel" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "partSize" INTEGER NOT NULL,
    "partCount" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "s3UploadId" TEXT,
    "clientSha256" TEXT,
    "status" "UploadIntentStatus" NOT NULL DEFAULT 'PENDING',
    "revisionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestJob" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_storageKey_key" ON "UploadIntent"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_revisionId_key" ON "UploadIntent"("revisionId");

-- CreateIndex
CREATE INDEX "UploadIntent_organizationId_status_idx" ON "UploadIntent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "UploadIntent_status_expiresAt_idx" ON "UploadIntent"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestJob_revisionId_key" ON "IngestJob"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestJob_idempotencyKey_key" ON "IngestJob"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
