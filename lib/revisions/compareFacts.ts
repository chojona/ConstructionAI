import { DomainError } from "@/lib/domain/errors";
import { type ProcessingRun, withProcessingRun } from "@/lib/observability/pipelineTiming";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ExtractionRunRecord, ProposedFactRecord, ProposedFactType } from "@/lib/domain/types";
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

/** Proposed-fact snapshot used for comparison. Acceptance lives in the review ledger. */
export interface ComparableFact {
  id?: string;
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
  timings?: ProcessingRun;
}) {
  return withProcessingRun(input.timings, "revision_comparison", async (timings) => {
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

    const beforeFacts = before.map(toComparableFact);
    const afterFacts = after.map(toComparableFact);
    const changes = await timings.stage("revision_comparison", () => compareFacts(beforeFacts, afterFacts), (result) => ({
      factCount: beforeFacts.length + afterFacts.length,
      changeCount: result.length,
    }));
    return {
      baseRevisionId: base.id,
      revisedRevisionId: revised.id,
      baseRunId: baseRun.id,
      revisedRunId: revisedRun.id,
      changes,
    };
  });
}

function compareCategory(before: IndexedFact[], after: IndexedFact[]): RevisionFactChange[] {
  const exact = pair(before, after, (left, right) => semanticallyEqual(left, right) && wordingEqual(left, right));
  const semantic = pair(exact.remainingBefore, exact.remainingAfter, semanticallyEqual);
  const identity = assignIdentity(semantic.remainingBefore, semantic.remainingAfter);
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
    if (canonicalUnit(text(before, "unit")) !== canonicalUnit(text(after, "unit"))) return "unit";
    if (canonicalDecimal(text(before, "amount")) !== canonicalDecimal(text(after, "amount"))) return "numeric";
  }
  if (before.factType === "schedule_date") {
    const beforeDate = resolvedIso(before);
    const afterDate = resolvedIso(after);
    if (beforeDate !== afterDate) return "date";
    if (beforeDate === null && normalizeLabel(text(before, "dateText")) !== normalizeLabel(text(after, "dateText"))) {
      return "date";
    }
  }
  if (text(before, "modality") !== text(after, "modality")) return "modality";
  const beforePolarity = obligationPolarity(obligationText(before));
  const afterPolarity = obligationPolarity(obligationText(after));
  if (beforePolarity && afterPolarity && beforePolarity !== afterPolarity) return "modality";
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

export function toComparableFact(fact: ProposedFactRecord): ComparableFact {
  return {
    id: fact.id,
    factType: fact.factType,
    payload: { ...fact.payload },
    evidence: fact.evidence.map((item) => ({ ...item })),
    ordinal: fact.ordinal,
  };
}

/** Stable slot for one requirement inside a single document. Documents are not merged. */
export function factSlotKey(fact: ComparableFact) {
  return `${fact.factType}:${identity(fact)}`;
}

/** Distinguishes semantically different requirements that share a slot key. */
export function requirementFingerprint(fact: ComparableFact) {
  normalizeFact(fact);
  const modality = text(fact, "modality");
  const key = factSlotKey(fact);
  if (fact.factType === "equipment_requirement") {
    return `${key}\u0000${modality}\u0000${normalizeLabel(text(fact, "statement"))}`;
  }
  if (fact.factType === "schedule_date") {
    return `${key}\u0000${modality}\u0000${resolvedIso(fact) ?? normalizeLabel(text(fact, "dateText"))}`;
  }
  return `${key}\u0000${modality}\u0000${canonicalDecimal(text(fact, "amount"))}\u0000${canonicalUnit(text(fact, "unit"))}`;
}

function snapshot(fact: ComparableFact): ComparableFact {
  return {
    ...(fact.id ? { id: fact.id } : {}),
    factType: fact.factType,
    payload: { ...fact.payload },
    evidence: fact.evidence.map((item) => ({ ...item })),
    ...(fact.ordinal === undefined ? {} : { ordinal: fact.ordinal }),
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

function obligationText(fact: ComparableFact) {
  if (fact.factType === "equipment_requirement") return text(fact, "statement");
  if (fact.factType === "schedule_date") return text(fact, "dateText");
  return text(fact, "originalText");
}

function obligationPolarity(value: string): "required" | "prohibited" | null {
  if (/\b(shall not|must not|may not|do not|does not|is not permitted|shall never)\b/i.test(value)) return "prohibited";
  if (/\b(shall|must|required)\b/i.test(value)) return "required";
  return null;
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

function assignIdentity(before: IndexedFact[], after: IndexedFact[]) {
  const groups = new Map<string, { before: IndexedFact[]; after: IndexedFact[] }>();
  const bucketFor = (fact: ComparableFact) => {
    const key = `${fact.factType}:${identity(fact)}`;
    const bucket = groups.get(key) ?? { before: [], after: [] };
    groups.set(key, bucket);
    return bucket;
  };
  for (const item of before) bucketFor(item.fact).before.push(item);
  for (const item of after) bucketFor(item.fact).after.push(item);

  const pairs: FactPair[] = [];
  const remainingBefore: IndexedFact[] = [];
  const remainingAfter: IndexedFact[] = [];
  for (const group of groups.values()) {
    const assigned = assignGroup(group.before, group.after);
    pairs.push(...assigned.pairs);
    remainingBefore.push(...assigned.remainingBefore);
    remainingAfter.push(...assigned.remainingAfter);
  }
  return { pairs, remainingBefore, remainingAfter };
}

function assignGroup(before: IndexedFact[], after: IndexedFact[]) {
  const pairs = chooseAssignment(before, after);
  const usedBefore = new Set(pairs.map((item) => item.before.index));
  const usedAfter = new Set(pairs.map((item) => item.after.index));
  return {
    pairs,
    remainingBefore: before.filter((item) => !usedBefore.has(item.index)),
    remainingAfter: after.filter((item) => !usedAfter.has(item.index)),
  };
}

function chooseAssignment(before: IndexedFact[], after: IndexedFact[]): FactPair[] {
  if (before.length === 0 || after.length === 0) return [];
  const rows = before.length <= after.length ? before : after;
  const cols = before.length <= after.length ? after : before;
  const rowIsBefore = before.length <= after.length;
  const used = new Array<boolean>(cols.length).fill(false);
  const current: number[] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  let bestSignature = "";
  let bestPairs: FactPair[] = [];

  const consider = () => {
    let cost = 0;
    const pairs: FactPair[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const col = cols[current[index]!]!;
      const left = rowIsBefore ? row : col;
      const right = rowIsBefore ? col : row;
      cost += pairCost(left.fact, right.fact);
      pairs.push({ before: left, after: right });
    }
    const signature = pairs
      .map((item) => `${item.before.index}:${item.after.index}`)
      .sort()
      .join(",");
    if (cost < bestCost || (cost === bestCost && signature < bestSignature)) {
      bestCost = cost;
      bestSignature = signature;
      bestPairs = pairs;
    }
  };

  const walk = () => {
    if (current.length === rows.length) {
      consider();
      return;
    }
    for (let index = 0; index < cols.length; index += 1) {
      if (used[index]) continue;
      used[index] = true;
      current.push(index);
      walk();
      current.pop();
      used[index] = false;
    }
  };
  walk();
  return bestPairs;
}

function pairCost(before: ComparableFact, after: ComparableFact) {
  if (semanticallyEqual(before, after)) return wordingEqual(before, after) ? 0 : 1;
  if (before.factType === "quantity") {
    const amountGap = Math.abs(
      Number(canonicalDecimal(text(before, "amount"))) - Number(canonicalDecimal(text(after, "amount"))),
    );
    const unitGap = canonicalUnit(text(before, "unit")) === canonicalUnit(text(after, "unit")) ? 0 : 100;
    const modalityGap = text(before, "modality") === text(after, "modality") ? 0 : 5;
    return 10 + amountGap + unitGap + modalityGap;
  }
  if (before.factType === "schedule_date") {
    const left = resolvedIso(before);
    const right = resolvedIso(after);
    if (left && right) return 10 + Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000;
    return 80;
  }
  return text(before, "modality") === text(after, "modality") ? 10 : 15;
}

function resolvedIso(fact: ComparableFact) {
  const stored = fact.payload.date ?? null;
  if (stored) return stored;
  return parseCalendarDate(text(fact, "dateText"));
}

function parseCalendarDate(value: string) {
  const text = value.trim().toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const month = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
  const monthFirst = new RegExp(`^(${month})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})$`);
  const dayFirst = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${month})\\s+(\\d{4})$`);
  const leadingMonth = monthFirst.exec(text);
  if (leadingMonth?.[1] && leadingMonth[2] && leadingMonth[3]) {
    return isoFromParts(Number(leadingMonth[3]), monthNumber(leadingMonth[1]), Number(leadingMonth[2]));
  }
  const leadingDay = dayFirst.exec(text);
  if (leadingDay?.[1] && leadingDay[2] && leadingDay[3]) {
    return isoFromParts(Number(leadingDay[3]), monthNumber(leadingDay[2]), Number(leadingDay[1]));
  }
  return null;
}

function monthNumber(name: string) {
  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
    jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  return months[name] ?? 0;
}

function isoFromParts(year: number, month: number, day: number) {
  if (month < 1 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}`;
}

const unitAliases = new Map<string, string>([
  ["c y", "cy"],
  ["cy", "cy"],
  ["cu yd", "cy"],
  ["cu yds", "cy"],
  ["cubic yard", "cy"],
  ["cubic yards", "cy"],
  ["yard", "cy"],
  ["yards", "cy"],
  ["yd", "cy"],
  ["yds", "cy"],
  ["inch", "in"],
  ["inches", "in"],
  ["in", "in"],
  ["foot", "ft"],
  ["feet", "ft"],
  ["ft", "ft"],
  ["linear foot", "lf"],
  ["linear feet", "lf"],
  ["lf", "lf"],
  ["square foot", "sf"],
  ["square feet", "sf"],
  ["sq ft", "sf"],
  ["sf", "sf"],
  ["each", "ea"],
  ["ea", "ea"],
  ["hour", "hr"],
  ["hours", "hr"],
  ["hr", "hr"],
  ["cubic meter", "m3"],
  ["cubic meters", "m3"],
  ["cubic metre", "m3"],
  ["cubic metres", "m3"],
  ["m3", "m3"],
]);

function canonicalUnit(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return unitAliases.get(cleaned) ?? cleaned;
}

function canonicalDecimal(value: string) {
  if (!decimalAmount.test(value)) {
    throw new DomainError("INVALID_INPUT", "Quantity amount must be a decimal string.", 400);
  }
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}
