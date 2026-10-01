CREATE TYPE "DocumentRevisionStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionLabel" TEXT NOT NULL,
    "revisionOrder" INTEGER NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentRevisionStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentRevisionId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_organizationId_createdAt_idx" ON "Project"("organizationId", "createdAt");
CREATE INDEX "Document_projectId_createdAt_idx" ON "Document"("projectId", "createdAt");
CREATE INDEX "DocumentRevision_documentId_createdAt_idx" ON "DocumentRevision"("documentId", "createdAt");
CREATE UNIQUE INDEX "DocumentRevision_documentId_revisionOrder_key" ON "DocumentRevision"("documentId", "revisionOrder");
CREATE UNIQUE INDEX "DocumentRevision_documentId_revisionLabel_key" ON "DocumentRevision"("documentId", "revisionLabel");
CREATE UNIQUE INDEX "DocumentRevision_documentId_sha256_key" ON "DocumentRevision"("documentId", "sha256");
CREATE INDEX "DocumentPage_documentRevisionId_idx" ON "DocumentPage"("documentRevisionId");
CREATE UNIQUE INDEX "DocumentPage_documentRevisionId_pageNumber_key" ON "DocumentPage"("documentRevisionId", "pageNumber");

ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentRevisionId_fkey" FOREIGN KEY ("documentRevisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
