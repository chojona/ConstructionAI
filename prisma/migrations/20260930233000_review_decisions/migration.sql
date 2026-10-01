CREATE TYPE "ReviewDecisionValue" AS ENUM ('ACCEPTED', 'DISMISSED', 'FLAGGED');
CREATE TYPE "ReviewSubjectKind" AS ENUM ('PROPOSED_FACT', 'REVISION_CHANGE');
CREATE TYPE "RevisionChangeType" AS ENUM ('ADDED', 'REMOVED', 'MODIFIED');

CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subjectKind" "ReviewSubjectKind" NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "decision" "ReviewDecisionValue" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reason" TEXT,
    "proposedFactId" TEXT NOT NULL,
    "beforeProposedFactId" TEXT,
    "afterProposedFactId" TEXT,
    "baseRevisionId" TEXT,
    "revisedRevisionId" TEXT,
    "changeType" "RevisionChangeType",
    "supersedesDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewDecision_supersedesDecisionId_key" ON "ReviewDecision"("supersedesDecisionId");
CREATE INDEX "ReviewDecision_projectId_subjectKey_createdAt_idx" ON "ReviewDecision"("projectId", "subjectKey", "createdAt");
CREATE INDEX "ReviewDecision_projectId_createdAt_idx" ON "ReviewDecision"("projectId", "createdAt");
CREATE INDEX "ReviewDecision_proposedFactId_idx" ON "ReviewDecision"("proposedFactId");

ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_proposedFactId_fkey" FOREIGN KEY ("proposedFactId") REFERENCES "ProposedFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_beforeProposedFactId_fkey" FOREIGN KEY ("beforeProposedFactId") REFERENCES "ProposedFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_afterProposedFactId_fkey" FOREIGN KEY ("afterProposedFactId") REFERENCES "ProposedFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_supersedesDecisionId_fkey" FOREIGN KEY ("supersedesDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
