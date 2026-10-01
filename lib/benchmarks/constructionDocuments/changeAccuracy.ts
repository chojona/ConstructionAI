import { scoreRevisionChange } from "@/lib/review/severity";
import { compareFacts, factSlotKey, type ComparableFact, type RevisionChangeType, type RevisionFactChange } from "@/lib/revisions/compareFacts";
import {
  revisionChangeCases,
  type ChangeCase,
  type ChangePhenomenon,
  type LabeledChange,
} from "./changeCases";

export const CHANGE_ACCURACY_GOALS = {
  materialPrecision: 0.98,
  materialRecall: 0.95,
  falseHighRate: 0.01,
} as const;

export type ChangeFailure =
  | "added mismatch"
  | "removed mismatch"
  | "modified mismatch"
  | "wording suppression"
  | "date normalization"
  | "unit normalization"
  | "repeated fact pairing"
  | "reorder"
  | "evidence"
  | "materiality";

export type ChangeMiss = {
  caseId: string;
  outcome: "missed" | "unexpected" | "evidence";
  fact: string;
  failure: ChangeFailure;
  detail: string;
};

type Counts = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
};

type Rates = Counts & {
  precision: number;
  recall: number;
  f1: number;
};

type PhenomenonSlice = {
  cases: number;
  falsePositives: number;
  falseNegatives: number;
  materialLeaks: number;
  evidenceCorrect: number;
  evidenceCompared: number;
};

type ActualChange = LabeledChange;

const definitions = {
  added: "Precision and recall for predicted ADDED changes, including non-material wording.",
  removed: "Precision and recall for predicted REMOVED changes.",
  modified: "Precision and recall for predicted MODIFIED changes. A match requires the labeled slot, material flag, and basis.",
  materialPrecision: "Material predictions that match a labeled material change, divided by all material predictions.",
  materialRecall: "Labeled material changes that were predicted, divided by all labeled material changes.",
  wordingSuppression: "Share of wording-only and normalization-equivalent cases that produced no material change.",
  falseHighRate: "Share of high or critical predictions that do not match a labeled change scored high or critical by the same deterministic rules. Wording-only changes score low. Revision text alone never scores critical.",
  evidenceCorrectness: "Share of matched changes whose old and new evidence excerpts are the labeled excerpts.",
} as const;

export function measureRevisionChangeAccuracy(cases: readonly ChangeCase[] = revisionChangeCases()) {
  const overall = emptyCounts();
  const byType = {
    ADDED: emptyCounts(),
    REMOVED: emptyCounts(),
    MODIFIED: emptyCounts(),
  };
  const material = emptyCounts();
  const phenomena = new Map<ChangePhenomenon, PhenomenonSlice>();
  const misses: ChangeMiss[] = [];
  let evidenceCorrect = 0;
  let evidenceCompared = 0;
  let highFindings = 0;
  let criticalFindings = 0;
  let falseHighFindings = 0;
  let falseCriticalFindings = 0;
  let normalizationCases = 0;
  let normalizationLeaks = 0;

  for (const changeCase of cases) {
    const compared = compareFacts(changeCase.before, changeCase.after);
    const actual = compared.map(toLabeled);
    const actualScores = compared.map((change) => scoreRevisionChange(change));
    const expectedScores = changeCase.expected.map((change) => scoreLabeled(changeCase, change));
    const matched = matchChanges(changeCase.expected, actual);
    addCounts(overall, matched.counts);
    for (const changeType of ["ADDED", "REMOVED", "MODIFIED"] as const) {
      addCounts(byType[changeType], matchChanges(
        changeCase.expected.filter((change) => change.changeType === changeType),
        actual.filter((change) => change.changeType === changeType),
      ).counts);
    }
    addCounts(material, matchChanges(
      changeCase.expected.filter((change) => change.material),
      actual.filter((change) => change.material),
    ).counts);
    const evidence = scoreEvidence(changeCase.expected, actual);
    evidenceCorrect += evidence.correct;
    evidenceCompared += evidence.compared;

    const high = actual.filter((_, index) => actualScores[index]!.severity === "high");
    const critical = actual.filter((_, index) => actualScores[index]!.severity === "critical");
    const highMatch = matchChanges(
      changeCase.expected.filter((_, index) => expectedScores[index]!.severity === "high"),
      high,
    );
    const criticalMatch = matchChanges(
      changeCase.expected.filter((_, index) => expectedScores[index]!.severity === "critical"),
      critical,
    );
    highFindings += high.length;
    criticalFindings += critical.length;
    falseHighFindings += highMatch.counts.falsePositives;
    falseCriticalFindings += criticalMatch.counts.falsePositives;

    const normalization = changeCase.expected.every((change) => !change.material)
      && changeCase.phenomena.some((tag) => tag === "wording-only" || tag === "date-normalization" || tag === "unit-normalization");
    const leaked = actual.some((change) => change.material);
    if (normalization) {
      normalizationCases += 1;
      if (leaked) normalizationLeaks += 1;
    }

    for (const tag of changeCase.phenomena) {
      const slice = phenomena.get(tag) ?? emptySlice();
      slice.cases += 1;
      slice.falsePositives += matched.counts.falsePositives;
      slice.falseNegatives += matched.counts.falseNegatives;
      if (leaked && normalization) slice.materialLeaks += 1;
      slice.evidenceCorrect += evidence.correct;
      slice.evidenceCompared += evidence.compared;
      phenomena.set(tag, slice);
    }

    misses.push(...matched.missed.map((change) => miss(changeCase, "missed", change, false)));
    misses.push(...matched.unexpected.map((change) => miss(changeCase, "unexpected", change, false)));
    misses.push(...evidence.misses.map((change) => miss(changeCase, "evidence", change, true)));
  }

  const materialRates = rates(material);
  const elevatedFindings = highFindings + criticalFindings;
  const falseElevatedFindings = falseHighFindings + falseCriticalFindings;
  const falseHighRate = elevatedFindings === 0 ? 0 : falseElevatedFindings / elevatedFindings;
  const targets = {
    materialPrecision: target(CHANGE_ACCURACY_GOALS.materialPrecision, materialRates.precision, materialRates.truePositives + materialRates.falsePositives > 0),
    materialRecall: target(CHANGE_ACCURACY_GOALS.materialRecall, materialRates.recall, materialRates.truePositives + materialRates.falseNegatives > 0),
    falseHighRate: {
      goal: CHANGE_ACCURACY_GOALS.falseHighRate,
      actual: falseHighRate,
      achieved: falseHighRate < CHANGE_ACCURACY_GOALS.falseHighRate,
    },
    allMeasuredTargetsMet: false,
  };
  targets.allMeasuredTargetsMet = targets.materialPrecision.achieved
    && targets.materialRecall.achieved
    && targets.falseHighRate.achieved;

  return {
    predictionSource: "deterministic-comparison" as const,
    note: "Human-labeled facts are compared directly. This run does not call a model and does not infer equipment or schedule conflicts beyond those facts.",
    definitions,
    targets,
    overall: rates(overall),
    byType: {
      ADDED: rates(byType.ADDED),
      REMOVED: rates(byType.REMOVED),
      MODIFIED: rates(byType.MODIFIED),
    },
    material: materialRates,
    wordingSuppression: normalizationCases === 0 ? 1 : (normalizationCases - normalizationLeaks) / normalizationCases,
    normalizationCases,
    normalizationLeaks,
    falseHighFindings,
    falseCriticalFindings,
    highFindings,
    criticalFindings,
    evidenceCorrectness: evidenceCompared === 0 ? 1 : evidenceCorrect / evidenceCompared,
    evidenceCompared,
    byPhenomenon: Object.fromEntries([...phenomena.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([tag, slice]) => [
      tag,
      {
        cases: slice.cases,
        falsePositives: slice.falsePositives,
        falseNegatives: slice.falseNegatives,
        materialLeaks: slice.materialLeaks,
        evidenceCorrectness: slice.evidenceCompared === 0 ? 1 : slice.evidenceCorrect / slice.evidenceCompared,
        evidenceCompared: slice.evidenceCompared,
      },
    ])),
    misses: misses.sort((left, right) => left.caseId.localeCompare(right.caseId)
      || left.outcome.localeCompare(right.outcome)
      || left.fact.localeCompare(right.fact)),
  };
}

export type ChangeAccuracyReport = ReturnType<typeof measureRevisionChangeAccuracy>;

export function classifyChangeMiss(
  phenomena: readonly ChangePhenomenon[],
  changeType: RevisionChangeType | null,
  evidence: boolean,
): ChangeFailure {
  if (evidence) return "evidence";
  if (phenomena.includes("repeated") && phenomena.includes("unit-normalization")) return "repeated fact pairing";
  if (phenomena.includes("date-normalization")) return "date normalization";
  if (phenomena.includes("unit-normalization")) return "unit normalization";
  if (phenomena.includes("repeated")) return "repeated fact pairing";
  if (phenomena.includes("reordered")) return "reorder";
  if (phenomena.includes("wording-only")) return "wording suppression";
  if (changeType === "ADDED") return "added mismatch";
  if (changeType === "REMOVED") return "removed mismatch";
  if (changeType === "MODIFIED") return "modified mismatch";
  return "materiality";
}

export function formatChangeAccuracyReport(report: ChangeAccuracyReport) {
  const lines = [
    "deterministic revision change accuracy",
    `prediction source ${report.predictionSource}`,
    `added precision ${formatMetric(report.byType.ADDED.precision)} recall ${formatMetric(report.byType.ADDED.recall)}`,
    `removed precision ${formatMetric(report.byType.REMOVED.precision)} recall ${formatMetric(report.byType.REMOVED.recall)}`,
    `modified precision ${formatMetric(report.byType.MODIFIED.precision)} recall ${formatMetric(report.byType.MODIFIED.recall)}`,
    `material precision ${formatMetric(report.material.precision)} goal ${formatMetric(report.targets.materialPrecision.goal)} achieved ${report.targets.materialPrecision.achieved}`,
    `material recall ${formatMetric(report.material.recall)} goal ${formatMetric(report.targets.materialRecall.goal)} achieved ${report.targets.materialRecall.achieved}`,
    `wording suppression ${formatMetric(report.wordingSuppression)} leaks ${report.normalizationLeaks}/${report.normalizationCases}`,
    `false high or critical findings ${report.falseHighFindings + report.falseCriticalFindings}/${report.highFindings + report.criticalFindings} rate ${formatMetric(report.targets.falseHighRate.actual)} achieved ${report.targets.falseHighRate.achieved}`,
    `evidence correctness ${formatMetric(report.evidenceCorrectness)} compared ${report.evidenceCompared}`,
    `all measured targets met ${report.targets.allMeasuredTargetsMet}`,
    "",
    "by phenomenon",
  ];
  for (const [tag, slice] of Object.entries(report.byPhenomenon)) {
    lines.push(`${tag}  cases ${slice.cases}  false positives ${slice.falsePositives}  false negatives ${slice.falseNegatives}  material leaks ${slice.materialLeaks}  evidence ${formatMetric(slice.evidenceCorrectness)}`);
  }
  lines.push("", `misses ${report.misses.length}`);
  for (const item of report.misses) lines.push(`${item.caseId}  ${item.outcome}  ${item.failure}  ${item.fact}`);
  return lines.join("\n");
}

function toLabeled(change: RevisionFactChange): ActualChange {
  const focus = (change.before ?? change.after)!;
  return {
    changeType: change.changeType,
    category: change.category,
    material: change.material,
    basis: change.basis,
    slot: factSlotKey(focus),
    beforeExcerpt: change.before?.evidence[0]?.excerpt ?? null,
    afterExcerpt: change.after?.evidence[0]?.excerpt ?? null,
  };
}

function matchChanges(expected: readonly ActualChange[], actual: readonly ActualChange[]) {
  const used = new Set<number>();
  const missed: ActualChange[] = [];
  for (const change of expected) {
    const index = actual.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && sameChange(candidate, change));
    if (index === -1) missed.push(change);
    else used.add(index);
  }
  const unexpected = actual.filter((_, index) => !used.has(index));
  return {
    counts: {
      truePositives: expected.length - missed.length,
      falsePositives: unexpected.length,
      falseNegatives: missed.length,
    },
    missed,
    unexpected,
  };
}

function scoreEvidence(expected: readonly ActualChange[], actual: readonly ActualChange[]) {
  const groups = new Map<string, { expected: ActualChange[]; actual: ActualChange[] }>();
  for (const change of expected) {
    const group = groups.get(changeKey(change)) ?? { expected: [], actual: [] };
    group.expected.push(change);
    groups.set(changeKey(change), group);
  }
  for (const change of actual) {
    const group = groups.get(changeKey(change));
    if (group) group.actual.push(change);
  }
  let correct = 0;
  let compared = 0;
  const misses: ActualChange[] = [];
  for (const group of groups.values()) {
    const used = new Set<number>();
    for (const change of group.expected) {
      let bestIndex = -1;
      let bestScore = -1;
      for (let index = 0; index < group.actual.length; index += 1) {
        if (used.has(index)) continue;
        const score = excerptScore(change, group.actual[index]!);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      if (bestIndex === -1) continue;
      used.add(bestIndex);
      const paired = group.actual[bestIndex]!;
      compared += 2;
      if (change.beforeExcerpt === paired.beforeExcerpt) correct += 1;
      if (change.afterExcerpt === paired.afterExcerpt) correct += 1;
      if (change.beforeExcerpt !== paired.beforeExcerpt || change.afterExcerpt !== paired.afterExcerpt) misses.push(change);
    }
  }
  return { correct, compared, misses };
}

function excerptScore(expected: ActualChange, actual: ActualChange) {
  return Number(expected.beforeExcerpt === actual.beforeExcerpt) + Number(expected.afterExcerpt === actual.afterExcerpt);
}

function miss(changeCase: ChangeCase, outcome: ChangeMiss["outcome"], change: ActualChange, evidence: boolean): ChangeMiss {
  return {
    caseId: changeCase.id,
    outcome,
    fact: `${change.changeType} ${change.slot}`,
    failure: classifyChangeMiss(changeCase.phenomena, change.changeType, evidence),
    detail: evidence
      ? `Expected evidence ${change.beforeExcerpt ?? "none"} -> ${change.afterExcerpt ?? "none"}.`
      : `${change.material ? "material" : "non-material"} ${change.basis}`,
  };
}

function scoreLabeled(changeCase: ChangeCase, change: ActualChange) {
  return scoreRevisionChange({
    changeType: change.changeType,
    category: change.category,
    material: change.material,
    basis: change.basis,
    before: change.beforeExcerpt === null ? null : factByExcerpt(changeCase.before, change.category, change.beforeExcerpt),
    after: change.afterExcerpt === null ? null : factByExcerpt(changeCase.after, change.category, change.afterExcerpt),
  });
}

function factByExcerpt(facts: readonly ComparableFact[], category: ActualChange["category"], excerpt: string) {
  return facts.find((fact) => fact.factType === category && fact.evidence.some((item) => item.excerpt === excerpt)) ?? null;
}

function sameChange(left: ActualChange, right: ActualChange) {
  return changeKey(left) === changeKey(right);
}

function changeKey(change: ActualChange) {
  return JSON.stringify({
    changeType: change.changeType,
    category: change.category,
    material: change.material,
    basis: change.basis,
    slot: change.slot,
  });
}

function emptyCounts(): Counts {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
}

function emptySlice(): PhenomenonSlice {
  return {
    cases: 0,
    falsePositives: 0,
    falseNegatives: 0,
    materialLeaks: 0,
    evidenceCorrect: 0,
    evidenceCompared: 0,
  };
}

function addCounts(target: Counts, extra: Counts) {
  target.truePositives += extra.truePositives;
  target.falsePositives += extra.falsePositives;
  target.falseNegatives += extra.falseNegatives;
}

function rates(counts: Counts): Rates {
  return { ...counts, precision: ratio(counts.truePositives, counts.falsePositives), recall: ratio(counts.truePositives, counts.falseNegatives), f1: harmonic(counts) };
}

function ratio(truePositives: number, errors: number) {
  const denominator = truePositives + errors;
  return denominator === 0 ? 1 : truePositives / denominator;
}

function harmonic(counts: Counts) {
  const matchedPrecision = ratio(counts.truePositives, counts.falsePositives);
  const matchedRecall = ratio(counts.truePositives, counts.falseNegatives);
  if (matchedPrecision + matchedRecall === 0) return 0;
  return (2 * matchedPrecision * matchedRecall) / (matchedPrecision + matchedRecall);
}

function target(goal: number, actual: number, measured: boolean) {
  return { goal, actual, achieved: measured && actual >= goal };
}

function formatMetric(value: number) {
  return value.toFixed(4);
}
