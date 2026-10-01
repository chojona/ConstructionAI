CREATE TYPE "EmailSendStatus" AS ENUM ('DRAFT', 'SENT');

CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "exportPacketId" TEXT NOT NULL,
    "status" "EmailSendStatus" NOT NULL,
    "recipients" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSend_projectId_createdAt_idx" ON "EmailSend"("projectId", "createdAt");
CREATE INDEX "EmailSend_projectId_exportPacketId_status_idx" ON "EmailSend"("projectId", "exportPacketId", "status");
CREATE INDEX "EmailSend_exportPacketId_idx" ON "EmailSend"("exportPacketId");

CREATE TABLE "EmailSendDecision" (
    "emailSendId" TEXT NOT NULL,
    "reviewDecisionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "EmailSendDecision_pkey" PRIMARY KEY ("emailSendId", "reviewDecisionId")
);

CREATE UNIQUE INDEX "EmailSendDecision_emailSendId_ordinal_key" ON "EmailSendDecision"("emailSendId", "ordinal");
CREATE INDEX "EmailSendDecision_reviewDecisionId_idx" ON "EmailSendDecision"("reviewDecisionId");

CREATE TABLE "EmailSendDocument" (
    "emailSendId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "EmailSendDocument_pkey" PRIMARY KEY ("emailSendId", "documentId")
);

CREATE UNIQUE INDEX "EmailSendDocument_emailSendId_ordinal_key" ON "EmailSendDocument"("emailSendId", "ordinal");
CREATE INDEX "EmailSendDocument_documentId_idx" ON "EmailSendDocument"("documentId");

ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_exportPacketId_fkey" FOREIGN KEY ("exportPacketId") REFERENCES "ExportPacket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailSendDecision" ADD CONSTRAINT "EmailSendDecision_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "EmailSend"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailSendDecision" ADD CONSTRAINT "EmailSendDecision_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailSendDocument" ADD CONSTRAINT "EmailSendDocument_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "EmailSend"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailSendDocument" ADD CONSTRAINT "EmailSendDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
