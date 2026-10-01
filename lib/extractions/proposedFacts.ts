import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ProposedFactRecord, RevisionPageRecord } from "@/lib/domain/types";
import type { ProposedConstructionFact } from "./constructionFacts";
import type { Clock } from "./service";

export async function recordProposedFacts(
  organizationId: string,
  extractionRunId: string,
  facts: ProposedConstructionFact[],
  repository: ConstructionRepository = constructionRepository,
  clock: Clock = () => new Date(),
) {
  const run = await repository.getExtractionRun(organizationId, extractionRunId);
  if (!run) throw new DomainError("NOT_FOUND", "Extraction run not found.", 404);
  if (run.status !== "RUNNING") {
    throw new DomainError("INVALID_TRANSITION", "Proposed facts can only be recorded for a running extraction.", 409);
  }

  const revision = await repository.getRevision(organizationId, run.documentRevisionId);
  if (!revision) throw new DomainError("NOT_FOUND", "Revision not found.", 404);

  const committed = await repository.commitProposedFacts({
    organizationId,
    extractionRunId,
    expectedStatus: "RUNNING",
    completedAt: clock(),
    facts: facts.map((fact) => ({
      factType: fact.type,
      payload: factPayload(fact),
      evidence: fact.evidence.map((item) => locateEvidence(revision.pages, item)),
    })),
  });
  if (!committed) {
    throw new DomainError("INVALID_TRANSITION", "Extraction run status changed before proposed facts could be recorded.", 409);
  }
  return committed;
}

export async function listProposedFacts(
  organizationId: string,
  extractionRunId: string,
  repository: ConstructionRepository = constructionRepository,
): Promise<ProposedFactRecord[]> {
  const facts = await repository.listProposedFacts(organizationId, extractionRunId);
  if (!facts) throw new DomainError("NOT_FOUND", "Extraction run not found.", 404);
  return facts;
}

function locateEvidence(
  pages: readonly RevisionPageRecord[],
  item: ProposedConstructionFact["evidence"][number],
) {
  const page = pages.find((candidate) => candidate.pageNumber === item.pageNumber);
  if (!page) {
    throw new DomainError("INVALID_INPUT", "Evidence references a page that is not part of this revision.", 400);
  }
  const located = page.text.slice(item.startOffset, item.endOffset);
  if (item.endOffset <= item.startOffset || located !== item.excerpt) {
    throw new DomainError(
      "INVALID_INPUT",
      "Evidence does not match an exact location on the source page.",
      400,
    );
  }
  return {
    documentPageId: page.id,
    pageNumber: page.pageNumber,
    excerpt: item.excerpt,
    startOffset: item.startOffset,
    endOffset: item.endOffset,
  };
}

function factPayload(fact: ProposedConstructionFact): Record<string, string | null> {
  if (fact.type === "equipment_requirement") {
    return { equipment: fact.equipment, statement: fact.statement, modality: fact.modality };
  }
  if (fact.type === "schedule_date") {
    return { event: fact.event, date: fact.date, dateText: fact.dateText, modality: fact.modality };
  }
  return {
    subject: fact.subject,
    amount: fact.amount,
    unit: fact.unit,
    originalText: fact.originalText,
    modality: fact.modality,
  };
}
