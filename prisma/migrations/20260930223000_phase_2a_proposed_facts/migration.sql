CREATE TYPE "ProposedFactType" AS ENUM ('equipment_requirement', 'schedule_date', 'quantity');

CREATE TABLE "ProposedFact" (
    "id" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "factType" "ProposedFactType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposedFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposedFactEvidence" (
    "id" TEXT NOT NULL,
    "proposedFactId" TEXT NOT NULL,
    "documentPageId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "excerpt" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    CONSTRAINT "ProposedFactEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposedFact_extractionRunId_idx" ON "ProposedFact"("extractionRunId");
CREATE UNIQUE INDEX "ProposedFact_extractionRunId_ordinal_key" ON "ProposedFact"("extractionRunId", "ordinal");
CREATE INDEX "ProposedFactEvidence_documentPageId_idx" ON "ProposedFactEvidence"("documentPageId");
CREATE UNIQUE INDEX "ProposedFactEvidence_proposedFactId_ordinal_key" ON "ProposedFactEvidence"("proposedFactId", "ordinal");

ALTER TABLE "ProposedFact" ADD CONSTRAINT "ProposedFact_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "ExtractionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProposedFactEvidence" ADD CONSTRAINT "ProposedFactEvidence_proposedFactId_fkey" FOREIGN KEY ("proposedFactId") REFERENCES "ProposedFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProposedFactEvidence" ADD CONSTRAINT "ProposedFactEvidence_documentPageId_fkey" FOREIGN KEY ("documentPageId") REFERENCES "DocumentPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
