import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ExtractionRunRecord, ProposedFactType } from "@/lib/domain/types";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { listProposedFacts } from "@/lib/extractions/proposedFacts";

export type RevisionChangeType = "ADDED" | "REMOVED" | "MODIFIED";
export type ComparisonBasis = "identity" | "numeric" | "unit" | "date" | "modality" | "wording";

export interface ComparableFactEvidence {
  documentPageId?: string;
  pageNumber: number;
  excerpt: string;
  startOffset: number;
  endOffset: number;
}

/** Proposed or accepted fact snapshot. Accepted facts do not exist until review workflow lands. */
export interface ComparableFact {
  factType: ProposedFactType;
  payload: Record<string, string | null>;
  evidence: ComparableFactEvidence[];
  ordinal?: number;
}

export interface RevisionFactChange {
  changeType: RevisionChangeType;
  category: ProposedFactType;
  material: boolean;
  basis: ComparisonBasis;
  before: ComparableFact | null;
  after: ComparableFact | null;
}

const categories: ProposedFactType[] = ["equipment_requirement", "schedule_date", "quantity"];
const changeOrder: Record<RevisionChangeType, number> = { REMOVED: 0, MODIFIED: 1, ADDED: 2 };
const modalities = new Set(["asserted", "conditional", "tentative", "historical", "proposed"]);
const decimalAmount = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

type IndexedFact = { fact: ComparableFact; index: number };
type FactPair = { before: IndexedFact; after: IndexedFact };

export function compareFacts(
  before: readonly ComparableFact[],
  after: readonly ComparableFact[],
): RevisionFactChange[] {
  const changes: RevisionFactChange[] = [];
  for (const category of categories) {
    changes.push(...compareCategory(
      before.flatMap((fact, index) => fact.factType === category ? [{ fact: normalizeFact(fact), index }] : []),
      after.flatMap((fact, index) => fact.factType === category ? [{ fact: normalizeFact(fact), index }] : []),
    ));
  }
  return changes.sort((left, right) => {
    const categoryDelta = categories.indexOf(left.category) - categories.indexOf(right.category);
    if (categoryDelta !== 0) return categoryDelta;
    const identityDelta = identityOf(left).localeCompare(identityOf(right));
    if (identityDelta !== 0) return identityDelta;
    return changeOrder[left.changeType] - changeOrder[right.changeType];
  });
}

export async function compareRevisionFacts(input: {
  organizationId: string;
  baseRevisionId: string;
  revisedRevisionId: string;
  repository?: ConstructionRepository;
}) {
  const repository = input.repository ?? constructionRepository;
  if (input.baseRevisionId === input.revisedRevisionId) {
    throw new DomainError("INVALID_INPUT", "Choose two different revisions of the same document.", 400);
  }

  const [base, revised] = await Promise.all([
    repository.getRevision(input.organizationId, input.baseRevisionId),
    repository.getRevision(input.organizationId, input.revisedRevisionId),
  ]);
  if (!base || !revised) throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  if (base.documentId !== revised.documentId) {
    throw new DomainError("INVALID_INPUT", "Revisions must belong to the same document.", 400);
  }

  const [baseRun, revisedRun] = await Promise.all([
    latestSucceededRun(repository, input.organizationId, base.id),
    latestSucceededRun(repository, input.organizationId, revised.id),
  ]);
  const [before, after] = await Promise.all([
    listProposedFacts(input.organizationId, baseRun.id, repository),
    listProposedFacts(input.organizationId, revisedRun.id, repository),
  ]);

  return {
    baseRevisionId: base.id,
    revisedRevisionId: revised.id,
    baseRunId: baseRun.id,
    revisedRunId: revisedRun.id,
    changes: compareFacts(before, after),
  };
}

function compareCategory(before: IndexedFact[], after: IndexedFact[]): RevisionFactChange[] {
  const exact = pair(before, after, (left, right) => semanticallyEqual(left, right) && wordingEqual(left, right));
  const semantic = pair(exact.remainingBefore, exact.remainingAfter, semanticallyEqual);
  const identity = pair(semantic.remainingBefore, semantic.remainingAfter, sameIdentity);
  const changes: RevisionFactChange[] = [];

  for (const matched of [...exact.pairs, ...semantic.pairs, ...identity.pairs]) {
    const change = classifyPair(matched.before.fact, matched.after.fact);
    if (change) changes.push(change);
  }
  for (const item of identity.remainingBefore) changes.push(unmatched("REMOVED", item.fact, null));
  for (const item of identity.remainingAfter) changes.push(unmatched("ADDED", null, item.fact));
  return changes;
}

function pair(
  before: IndexedFact[],
  after: IndexedFact[],
  matches: (left: ComparableFact, right: ComparableFact) => boolean,
) {
  const usedAfter = new Set<number>();
  const usedBefore = new Set<number>();
  const pairs: FactPair[] = [];
  for (const left of before) {
    const right = after.find((candidate) => !usedAfter.has(candidate.index) && matches(left.fact, candidate.fact));
    if (!right) continue;
    usedAfter.add(right.index);
    usedBefore.add(left.index);
    pairs.push({ before: left, after: right });
  }
  return {
    pairs,
    remainingBefore: before.filter((item) => !usedBefore.has(item.index)),
    remainingAfter: after.filter((item) => !usedAfter.has(item.index)),
  };
}

function classifyPair(before: ComparableFact, after: ComparableFact): RevisionFactChange | null {
  const basis = semanticBasis(before, after);
  if (basis) return change("MODIFIED", true, basis, before, after);
  if (!wordingEqual(before, after)) return change("MODIFIED", false, "wording", before, after);
  return null;
}

function semanticBasis(before: ComparableFact, after: ComparableFact): ComparisonBasis | null {
  if (before.factType === "quantity") {
    if (normalizeUnit(text(before, "unit")) !== normalizeUnit(text(after, "unit"))) return "unit";
    if (canonicalDecimal(text(before, "amount")) !== canonicalDecimal(text(after, "amount"))) return "numeric";
  }
  if (before.factType === "schedule_date") {
    const beforeDate = before.payload.date ?? null;
    const afterDate = after.payload.date ?? null;
    if (beforeDate !== afterDate) return "date";
    if (beforeDate === null && normalizeLabel(text(before, "dateText")) !== normalizeLabel(text(after, "dateText"))) {
      return "date";
    }
  }
  if (text(before, "modality") !== text(after, "modality")) return "modality";
  return null;
}

function semanticallyEqual(before: ComparableFact, after: ComparableFact) {
  return sameIdentity(before, after) && semanticBasis(before, after) === null;
}

function wordingEqual(before: ComparableFact, after: ComparableFact) {
  if (before.factType === "equipment_requirement") {
    return normalizeLabel(text(before, "statement")) === normalizeLabel(text(after, "statement"));
  }
  if (before.factType === "schedule_date") {
    return normalizeLabel(text(before, "dateText")) === normalizeLabel(text(after, "dateText"));
  }
  return normalizeLabel(text(before, "originalText")) === normalizeLabel(text(after, "originalText"));
}

function sameIdentity(before: ComparableFact, after: ComparableFact) {
  return before.factType === after.factType && identity(before) === identity(after);
}

function identity(fact: ComparableFact) {
  if (fact.factType === "equipment_requirement") return normalizeLabel(text(fact, "equipment"));
  if (fact.factType === "schedule_date") return normalizeLabel(text(fact, "event"));
  return normalizeLabel(text(fact, "subject"));
}

function identityOf(change: RevisionFactChange) {
  return identity((change.before ?? change.after)!);
}

function unmatched(
  changeType: "ADDED" | "REMOVED",
  before: ComparableFact | null,
  after: ComparableFact | null,
): RevisionFactChange {
  return change(changeType, true, "identity", before, after);
}

function change(
  changeType: RevisionChangeType,
  material: boolean,
  basis: ComparisonBasis,
  before: ComparableFact | null,
  after: ComparableFact | null,
): RevisionFactChange {
  return {
    changeType,
    category: (before ?? after)!.factType,
    material,
    basis,
    before: before ? snapshot(before) : null,
    after: after ? snapshot(after) : null,
  };
}

function snapshot(fact: ComparableFact): ComparableFact {
  return {
    factType: fact.factType,
    payload: { ...fact.payload },
    evidence: fact.evidence.map((item) => ({ ...item })),
  };
}

function normalizeFact(fact: ComparableFact): ComparableFact {
  if (!categories.includes(fact.factType)) {
    throw new DomainError("INVALID_INPUT", "Revision comparison only supports equipment, schedule, and quantity facts.", 400);
  }
  const modality = text(fact, "modality");
  if (!modalities.has(modality)) {
    throw new DomainError("INVALID_INPUT", "Fact modality is missing or unsupported.", 400);
  }
  if (fact.factType === "equipment_requirement") {
    text(fact, "equipment");
    text(fact, "statement");
  } else if (fact.factType === "schedule_date") {
    text(fact, "event");
    text(fact, "dateText");
    const date = fact.payload.date ?? null;
    if (date !== null && (typeof date !== "string" || !isoDate.test(date))) {
      throw new DomainError("INVALID_INPUT", "Schedule date must be an ISO calendar date or null.", 400);
    }
  } else {
    text(fact, "subject");
    text(fact, "unit");
    text(fact, "originalText");
    canonicalDecimal(text(fact, "amount"));
  }
  return fact;
}

async function latestSucceededRun(
  repository: ConstructionRepository,
  organizationId: string,
  documentRevisionId: string,
): Promise<ExtractionRunRecord> {
  const runs = await repository.listExtractionRuns(organizationId, documentRevisionId);
  const latest = (runs ?? [])
    .filter((run) => (
      run.status === "SUCCEEDED"
      && run.extractorName === CONSTRUCTION_FACTS_EXTRACTOR.name
      && run.extractorVersion === CONSTRUCTION_FACTS_EXTRACTOR.version
    ))
    .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
  if (!latest) {
    throw new DomainError("INVALID_INPUT", "Revision has no succeeded construction-facts-v1 extraction.", 400);
  }
  return latest;
}

function text(fact: ComparableFact, key: string) {
  const value = fact.payload[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError("INVALID_INPUT", `Fact is missing ${key}.`, 400);
  }
  return value;
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeUnit(value: string) {
  return value.trim().toLowerCase();
}

function canonicalDecimal(value: string) {
  if (!decimalAmount.test(value)) {
    throw new DomainError("INVALID_INPUT", "Quantity amount must be a decimal string.", 400);
  }
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}
