import { factSlotKey, type ComparableFact } from "@/lib/revisions/compareFacts";
import { CONSTRUCTION_DOCUMENT_BENCHMARK, type BenchmarkChange, type BenchmarkPair } from "./dataset";
import { comparableFactsForSide } from "./evaluate";

export type ChangePhenomenon =
  | "added"
  | "removed"
  | "modified"
  | "wording-only"
  | "date-normalization"
  | "unit-normalization"
  | "reordered"
  | "repeated"
  | "evidence";

export type LabeledChange = BenchmarkChange & {
  beforeExcerpt: string | null;
  afterExcerpt: string | null;
};

export type ChangeCase = {
  id: string;
  source: "construction-documents-v1" | "normalization-regression";
  phenomena: ChangePhenomenon[];
  before: ComparableFact[];
  after: ComparableFact[];
  expected: LabeledChange[];
};

export function revisionChangeCases(): ChangeCase[] {
  return [
    ...CONSTRUCTION_DOCUMENT_BENCHMARK.pairs.map(datasetCase),
    trenchUnitAlias(),
    scarificationInchAlias(),
    drawingDateAlias(),
    compostReorder(),
    embankmentReorder(),
    nearestExcavation(),
  ];
}

function datasetCase(pair: BenchmarkPair): ChangeCase {
  const before = comparableFactsForSide(pair.base);
  const after = comparableFactsForSide(pair.revised);
  const beforeExcerpts = excerptsBySlot(before);
  const afterExcerpts = excerptsBySlot(after);
  const phenomena = new Set<ChangePhenomenon>(["evidence"]);
  if (pair.phenomena.includes("wording-only") || pair.expectedChanges.every((change) => !change.material)) {
    phenomena.add("wording-only");
  }
  if (pair.phenomena.includes("repeated-text")) phenomena.add("repeated");
  for (const change of pair.expectedChanges) {
    if (change.changeType === "ADDED") phenomena.add("added");
    if (change.changeType === "REMOVED") phenomena.add("removed");
    if (change.changeType === "MODIFIED") phenomena.add("modified");
  }
  return {
    id: pair.id,
    source: "construction-documents-v1",
    phenomena: [...phenomena].sort(),
    before,
    after,
    expected: pair.expectedChanges.map((change) => ({
      ...change,
      beforeExcerpt: change.changeType === "ADDED" ? null : takeExcerpt(beforeExcerpts, change.slot),
      afterExcerpt: change.changeType === "REMOVED" ? null : takeExcerpt(afterExcerpts, change.slot),
    })),
  };
}

function trenchUnitAlias(): ChangeCase {
  return {
    id: "normalization-ct-trench-unit",
    source: "normalization-regression",
    phenomena: ["evidence", "unit-normalization", "wording-only"],
    before: [quantity("trench excavation", "3165", "C.Y.", "3,165 C.Y.", "3,165 C.Y.")],
    after: [quantity("trench excavation", "3165", "cubic yards", "3,165 cubic yards", "3,165 cubic yards")],
    expected: [wording("quantity", "quantity:trench excavation", "3,165 C.Y.", "3,165 cubic yards")],
  };
}

function scarificationInchAlias(): ChangeCase {
  return {
    id: "normalization-scarification-inch",
    source: "normalization-regression",
    phenomena: ["evidence", "unit-normalization", "wording-only"],
    before: [quantity("scarification depth", "6", "inches", "6 inches", "6 inches")],
    after: [quantity("scarification depth", "6", "inch", "6 inch", "6 inch")],
    expected: [wording("quantity", "quantity:scarification depth", "6 inches", "6 inch")],
  };
}

function drawingDateAlias(): ChangeCase {
  return {
    id: "normalization-catawba-date",
    source: "normalization-regression",
    phenomena: ["date-normalization", "evidence", "wording-only"],
    before: [schedule("civil drawings", "2025-06-06", "June 6, 2025", "June 6, 2025")],
    after: [schedule("civil drawings", null, "6 June 2025", "6 June 2025")],
    expected: [wording("schedule_date", "schedule_date:civil drawings", "June 6, 2025", "6 June 2025")],
  };
}

function compostReorder(): ChangeCase {
  const four = quantity("compost", "4", "yards", "4 cubic yards", "4 cubic yards");
  const six = quantity("compost", "6", "yards", "6 cubic yards", "6 cubic yards");
  return {
    id: "repeated-thornton-compost-reorder",
    source: "normalization-regression",
    phenomena: ["repeated", "reordered", "unit-normalization", "wording-only"],
    before: [four, six],
    after: [
      quantity("compost", "6", "cubic yards", "6 cubic yards", "6 cubic yards"),
      quantity("compost", "4", "cubic yards", "4 cubic yards", "4 cubic yards"),
    ],
    expected: [],
  };
}

function embankmentReorder(): ChangeCase {
  const facts = [
    equipment("removed concrete and asphalt material", "Removed concrete and asphalt material shall not be used to construct embankments."),
    schedule("civil drawings", "2025-06-06", "June 6, 2025", "June 6, 2025"),
    quantity("solid material", "6", "inches", "6 inches", "6 inches"),
  ];
  return {
    id: "reordered-thornton-embankment",
    source: "normalization-regression",
    phenomena: ["reordered", "wording-only"],
    before: facts,
    after: [...facts].reverse(),
    expected: [],
  };
}

function nearestExcavation(): ChangeCase {
  return {
    id: "repeated-nearest-excavation",
    source: "normalization-regression",
    phenomena: ["evidence", "modified", "repeated"],
    before: [
      quantity("excavation", "10", "CY", "10 CY", "10 CY"),
      quantity("excavation", "20", "CY", "20 CY", "20 CY"),
    ],
    after: [
      quantity("excavation", "21", "CY", "21 CY", "21 CY"),
      quantity("excavation", "11", "CY", "11 CY", "11 CY"),
    ],
    expected: [
      modified("quantity", "quantity:excavation", "numeric", "10 CY", "11 CY"),
      modified("quantity", "quantity:excavation", "numeric", "20 CY", "21 CY"),
    ],
  };
}

function wording(
  category: LabeledChange["category"],
  slot: string,
  beforeExcerpt: string,
  afterExcerpt: string,
): LabeledChange {
  return { changeType: "MODIFIED", category, material: false, basis: "wording", slot, beforeExcerpt, afterExcerpt };
}

function modified(
  category: LabeledChange["category"],
  slot: string,
  basis: LabeledChange["basis"],
  beforeExcerpt: string,
  afterExcerpt: string,
): LabeledChange {
  return { changeType: "MODIFIED", category, material: true, basis, slot, beforeExcerpt, afterExcerpt };
}

function excerptsBySlot(facts: readonly ComparableFact[]) {
  const queues = new Map<string, Array<string | null>>();
  for (const fact of facts) {
    const slot = factSlotKey(fact);
    const list = queues.get(slot) ?? [];
    list.push(fact.evidence[0]?.excerpt ?? null);
    queues.set(slot, list);
  }
  return queues;
}

function takeExcerpt(queues: Map<string, Array<string | null>>, slot: string) {
  const list = queues.get(slot);
  if (!list?.length) return null;
  return list.shift() ?? null;
}

function equipment(name: string, statement: string): ComparableFact {
  return {
    factType: "equipment_requirement",
    payload: { equipment: name, statement, modality: "asserted" },
    evidence: [{ pageNumber: 1, excerpt: statement, startOffset: 0, endOffset: statement.length }],
  };
}

function schedule(event: string, date: string | null, dateText: string, excerpt: string): ComparableFact {
  return {
    factType: "schedule_date",
    payload: { event, date, dateText, modality: "asserted" },
    evidence: [{ pageNumber: 1, excerpt, startOffset: 0, endOffset: excerpt.length }],
  };
}

function quantity(subject: string, amount: string, unit: string, originalText: string, excerpt: string): ComparableFact {
  return {
    factType: "quantity",
    payload: { subject, amount, unit, originalText, modality: "asserted" },
    evidence: [{ pageNumber: 1, excerpt, startOffset: 0, endOffset: excerpt.length }],
  };
}
