import {
  CONSTRUCTION_FACTS_EXTRACTOR,
  parseConstructionFactsV1,
  type ConstructionFactPage,
  type ProposedConstructionFact,
} from "../constructionFacts";
import { goldPrediction, type ConstructionFactsFixture } from "./fixtures";
import { f1, precision, recall, scoreConstructionFactsEval } from "./score";

export const EXTRACTION_QUALITY_GOALS = {
  precision: 0.98,
  recall: 0.95,
  evidenceCorrectness: 0.99,
} as const;

export type ExtractionFailure =
  | "parsing"
  | "prompt/schema"
  | "chunk/context"
  | "normalization"
  | "evidence anchoring"
  | "model behavior"
  | "benchmark ambiguity";

export type QualityContext = {
  notFacts?: readonly { pageNumber: number; excerpt: string }[];
  difficulty?: readonly string[];
};

export type ExtractionMiss = {
  fixtureId: string;
  outcome: "missed" | "unexpected" | "malformed";
  fact: string;
  failure: ExtractionFailure;
  detail: string;
};

type MetricRates = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  evidenceCorrectness: number;
  evidenceCompared: number;
  hallucinatedFactRate: number;
  modalityCorrectness: number;
  modalityCompared: number;
  normalizationCorrectness: number;
  normalizationCompared: number;
  unsupportedHighConfidenceFacts: number;
};

type TargetResult = {
  goal: number;
  actual: number;
  achieved: boolean;
};

export type ExtractionQualityReport = {
  predictionSource: "model";
  model: { provider: string; model: string };
  note: string;
  definitions: {
    precision: string;
    recall: string;
    f1: string;
    evidenceCorrectness: string;
    hallucinatedFactRate: string;
    modalityCorrectness: string;
    normalizationCorrectness: string;
    unsupportedHighConfidenceFacts: string;
  };
  targets: {
    precision: TargetResult;
    recall: TargetResult;
    evidenceCorrectness: TargetResult;
    unsupportedHighConfidenceFacts: TargetResult;
    allMeasuredTargetsMet: boolean;
  };
  overall: MetricRates;
  byType: Record<string, MetricRates>;
  byDifficulty: Record<string, MetricRates>;
  misses: ExtractionMiss[];
};

type Bucket = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  evidenceCorrect: number;
  evidenceCompared: number;
  modalityCorrect: number;
  modalityCompared: number;
  normalizationCorrect: number;
  normalizationCompared: number;
  predictions: number;
  ungrounded: number;
  unsupportedHighConfidenceFacts: number;
};

type Link = {
  expected: ProposedConstructionFact;
  predicted: ProposedConstructionFact;
  valueMatch: boolean;
  evidenceMatch: boolean;
  modalityMatch: boolean;
};

const definitions = {
  precision: "Strict true positives divided by strict true positives plus false positives. A strict match requires type, modality, evidence, and normalized payload, including the schedule event name.",
  recall: "Strict true positives divided by strict true positives plus false negatives.",
  f1: "Harmonic mean of strict precision and strict recall.",
  evidenceCorrectness: "Share of value-matched facts whose evidence excerpt covers the labeled excerpt. Value match ignores modality, evidence, and schedule event names. The rate is 0 when no value match was compared.",
  hallucinatedFactRate: "Share of predictions that neither value-match a labeled fact nor overlap its evidence.",
  modalityCorrectness: "Share of value-matched facts with the labeled modality. The rate is 0 when no value match was compared.",
  normalizationCorrectness: "Share of type-aligned facts whose amount, unit, date, date text, or equipment statement matches the label. The rate is 0 when no alignment was compared.",
  unsupportedHighConfidenceFacts: "Asserted predictions that neither value-match a labeled fact nor overlap its evidence. The goal is zero.",
} as const;

export function scoreExtractionQuality(
  fixtures: readonly ConstructionFactsFixture[],
  predictions: Readonly<Record<string, unknown>>,
  options: { provider: string; model: string; context?: Readonly<Record<string, QualityContext>> },
): ExtractionQualityReport {
  const strict = scoreConstructionFactsEval(fixtures, predictions);
  const overall = emptyBucket();
  const byType = new Map<string, Bucket>();
  const byDifficulty = new Map<string, Bucket>();
  const misses: ExtractionMiss[] = [];

  for (const fixture of fixtures) {
    const context = options.context?.[fixture.id];
    const tags = [...(context?.difficulty ?? [])];
    const outcome = inspectFixture(fixture, predictions[fixture.id], context?.notFacts ?? []);
    addCounts(overall, outcome.counts);
    for (const [type, counts] of Object.entries(outcome.types)) addCounts(bucketFor(byType, type), counts);
    for (const tag of tags) addCounts(bucketFor(byDifficulty, tag), outcome.counts);
    misses.push(...outcome.misses);
  }

  const overallRates = rates(overall);
  if (overallRates.truePositives !== strict.truePositives
    || overallRates.falsePositives !== strict.falsePositives
    || overallRates.falseNegatives !== strict.falseNegatives) {
    throw new Error("Extraction quality counts drifted from the strict scorer.");
  }

  const targets = {
    precision: target(EXTRACTION_QUALITY_GOALS.precision, overallRates.precision, overallRates.truePositives + overallRates.falsePositives > 0),
    recall: target(EXTRACTION_QUALITY_GOALS.recall, overallRates.recall, overallRates.truePositives + overallRates.falseNegatives > 0),
    evidenceCorrectness: target(
      EXTRACTION_QUALITY_GOALS.evidenceCorrectness,
      overallRates.evidenceCorrectness,
      overallRates.evidenceCompared > 0,
    ),
    unsupportedHighConfidenceFacts: target(0, overallRates.unsupportedHighConfidenceFacts, true),
    allMeasuredTargetsMet: false,
  };
  targets.allMeasuredTargetsMet = targets.precision.achieved
    && targets.recall.achieved
    && targets.evidenceCorrectness.achieved
    && targets.unsupportedHighConfidenceFacts.achieved;

  return {
    predictionSource: "model",
    model: { provider: options.provider, model: options.model },
    note: "Human labels are the reference. A goal is achieved only when this run meets it.",
    definitions,
    targets,
    overall: overallRates,
    byType: Object.fromEntries([...byType.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, bucket]) => [key, rates(bucket)])),
    byDifficulty: Object.fromEntries([...byDifficulty.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, bucket]) => [key, rates(bucket)])),
    misses: misses.sort((left, right) => left.fixtureId.localeCompare(right.fixtureId)
      || left.outcome.localeCompare(right.outcome)
      || left.fact.localeCompare(right.fact)),
  };
}

export function formatQualityReport(report: ExtractionQualityReport) {
  const lines = [
    `${report.model.provider}/${report.model.model} extraction accuracy`,
    `prediction source ${report.predictionSource}`,
    `precision ${formatMetric(report.overall.precision)} goal ${formatMetric(report.targets.precision.goal)} achieved ${report.targets.precision.achieved}`,
    `recall ${formatMetric(report.overall.recall)} goal ${formatMetric(report.targets.recall.goal)} achieved ${report.targets.recall.achieved}`,
    `f1 ${formatMetric(report.overall.f1)}`,
    `evidence correctness ${formatMetric(report.overall.evidenceCorrectness)} compared ${report.overall.evidenceCompared} achieved ${report.targets.evidenceCorrectness.achieved}`,
    `hallucinated fact rate ${formatMetric(report.overall.hallucinatedFactRate)}`,
    `modality correctness ${formatMetric(report.overall.modalityCorrectness)} compared ${report.overall.modalityCompared}`,
    `normalization correctness ${formatMetric(report.overall.normalizationCorrectness)} compared ${report.overall.normalizationCompared}`,
    `unsupported high-confidence facts ${report.overall.unsupportedHighConfidenceFacts} achieved ${report.targets.unsupportedHighConfidenceFacts.achieved}`,
    `all measured targets met ${report.targets.allMeasuredTargetsMet}`,
    "",
    "by fact type",
  ];
  for (const [type, counts] of Object.entries(report.byType)) {
    lines.push(`${type}  precision ${formatMetric(counts.precision)}  recall ${formatMetric(counts.recall)}  f1 ${formatMetric(counts.f1)}  evidence ${formatMetric(counts.evidenceCorrectness)}`);
  }
  lines.push("", "by difficulty");
  for (const [type, counts] of Object.entries(report.byDifficulty)) {
    lines.push(`${type}  precision ${formatMetric(counts.precision)}  recall ${formatMetric(counts.recall)}  f1 ${formatMetric(counts.f1)}`);
  }
  lines.push("", `misses ${report.misses.length}`);
  for (const miss of report.misses) {
    lines.push(`${miss.fixtureId}  ${miss.outcome}  ${miss.failure}  ${miss.fact}  ${miss.detail}`);
  }
  return lines.join("\n");
}

function inspectFixture(
  fixture: ConstructionFactsFixture,
  raw: unknown,
  notFacts: readonly { pageNumber: number; excerpt: string }[],
) {
  const expected = parseExpected(fixture);
  const predicted = parsePredicted(fixture, raw);
  if (!predicted.ok) {
    const misses: ExtractionMiss[] = expected.map((fact) => ({
      fixtureId: fixture.id,
      outcome: "missed" as const,
      fact: labelFact(fact),
      failure: predicted.failure,
      detail: predicted.detail,
    }));
    misses.push({
      fixtureId: fixture.id,
      outcome: "malformed",
      fact: "malformed output",
      failure: predicted.failure,
      detail: predicted.detail,
    });
    return {
      expected,
      predicted: [] as ProposedConstructionFact[],
      misses,
      types: malformedTypes(expected),
      counts: {
        ...emptyBucket(),
        falsePositives: 1,
        falseNegatives: expected.length,
        predictions: 1,
        ungrounded: 1,
        unsupportedHighConfidenceFacts: 1,
      },
    };
  }

  const remaining = [...predicted.facts];
  const links: Link[] = [];
  let truePositives = 0;
  const missed: ProposedConstructionFact[] = [];
  for (const fact of expected) {
    const index = remaining.findIndex((candidate) => strictMatch(fact, candidate));
    if (index < 0) {
      missed.push(fact);
      continue;
    }
    const match = remaining[index];
    if (!match) continue;
    truePositives += 1;
    links.push(link(fact, match));
    remaining.splice(index, 1);
  }

  const partials: Link[] = [];
  for (const fact of missed) {
    const index = remaining.findIndex((candidate) => candidate.type === fact.type && (valueMatch(fact, candidate) || looseIdentity(fact, candidate)));
    if (index < 0) continue;
    const match = remaining[index];
    if (!match) continue;
    partials.push(link(fact, match));
    remaining.splice(index, 1);
  }

  const misses: ExtractionMiss[] = [];
  for (const fact of missed) {
    const paired = partials.find((item) => item.expected === fact);
    misses.push({
      fixtureId: fixture.id,
      outcome: "missed",
      fact: labelFact(fact),
      ...classifyExpected(fact, paired?.predicted, fixture.pages, notFacts),
    });
  }
  for (const fact of remaining) {
    misses.push({
      fixtureId: fixture.id,
      outcome: "unexpected",
      fact: labelFact(fact),
      ...classifyUnexpected(fact, partials, fixture.pages, notFacts),
    });
  }
  for (const fact of partials.map((item) => item.predicted)) {
    if (remaining.includes(fact)) continue;
    if (misses.some((miss) => miss.outcome === "unexpected" && miss.fact === labelFact(fact))) continue;
    misses.push({
      fixtureId: fixture.id,
      outcome: "unexpected",
      fact: labelFact(fact),
      ...classifyUnexpected(fact, partials, fixture.pages, notFacts),
    });
  }

  const valueLinks = [...links, ...partials].filter((item) => item.valueMatch);
  const aligned = [...links, ...partials];
  const ungrounded = predicted.facts.filter((fact) => !valueLinks.some((item) => item.predicted === fact) && !expected.some((item) => evidenceOverlaps(item, fact)));
  return {
    expected,
    predicted: predicted.facts,
    misses,
    types: typeBuckets(expected, predicted.facts, links, partials),
    counts: {
      truePositives,
      falsePositives: predicted.facts.length - truePositives,
      falseNegatives: expected.length - truePositives,
      evidenceCorrect: valueLinks.filter((item) => item.evidenceMatch).length,
      evidenceCompared: valueLinks.length,
      modalityCorrect: valueLinks.filter((item) => item.modalityMatch).length,
      modalityCompared: valueLinks.length,
      normalizationCorrect: aligned.filter((item) => normalizedPayload(item.expected, item.predicted)).length,
      normalizationCompared: aligned.length,
      predictions: predicted.facts.length,
      ungrounded: ungrounded.length,
      unsupportedHighConfidenceFacts: ungrounded.filter((fact) => fact.modality === "asserted").length,
    },
  };
}

function malformedTypes(expected: readonly ProposedConstructionFact[]) {
  const types: Record<string, Bucket> = { malformed: { ...emptyBucket(), falsePositives: 1, predictions: 1, ungrounded: 1, unsupportedHighConfidenceFacts: 1 } };
  for (const fact of expected) {
    const bucket = types[fact.type] ?? emptyBucket();
    bucket.falseNegatives += 1;
    types[fact.type] = bucket;
  }
  return types;
}

function typeBuckets(
  expected: readonly ProposedConstructionFact[],
  predicted: readonly ProposedConstructionFact[],
  links: readonly Link[],
  partials: readonly Link[],
) {
  const types = new Set<string>([...expected, ...predicted].map((fact) => fact.type));
  const buckets: Record<string, Bucket> = {};
  for (const type of types) {
    const expectedCount = expected.filter((fact) => fact.type === type).length;
    const predictedFacts = predicted.filter((fact) => fact.type === type);
    const strictLinks = links.filter((item) => item.expected.type === type);
    const valueLinks = [...links, ...partials].filter((item) => item.valueMatch && item.expected.type === type);
    const aligned = [...links, ...partials].filter((item) => item.expected.type === type);
    const ungrounded = predictedFacts.filter((fact) => (
      !valueLinks.some((item) => item.predicted === fact)
      && !expected.some((item) => evidenceOverlaps(item, fact))
    ));
    buckets[type] = {
      truePositives: strictLinks.length,
      falsePositives: predictedFacts.length - strictLinks.length,
      falseNegatives: expectedCount - strictLinks.length,
      evidenceCorrect: valueLinks.filter((item) => item.evidenceMatch).length,
      evidenceCompared: valueLinks.length,
      modalityCorrect: valueLinks.filter((item) => item.modalityMatch).length,
      modalityCompared: valueLinks.length,
      normalizationCorrect: aligned.filter((item) => normalizedPayload(item.expected, item.predicted)).length,
      normalizationCompared: aligned.length,
      predictions: predictedFacts.length,
      ungrounded: ungrounded.length,
      unsupportedHighConfidenceFacts: ungrounded.filter((fact) => fact.modality === "asserted").length,
    };
  }
  return buckets;
}

function classifyExpected(
  expected: ProposedConstructionFact,
  predicted: ProposedConstructionFact | undefined,
  pages: readonly ConstructionFactPage[],
  notFacts: readonly { pageNumber: number; excerpt: string }[],
): { failure: ExtractionFailure; detail: string } {
  if (!predicted) {
    if (expected.evidence.some((item) => item.excerpt.includes("\n"))) {
      return { failure: "chunk/context", detail: "Labeled evidence crosses a line break the extractor treats as a chunk boundary." };
    }
    if (!pageContains(pages, identityText(expected))) {
      return { failure: "benchmark ambiguity", detail: `Labeled ${identityText(expected)} does not appear on the page.` };
    }
    return { failure: "model behavior", detail: "The extractor did not return this labeled fact." };
  }
  if (expected.type === "schedule_date" && predicted.type === "schedule_date"
    && expected.date === predicted.date && norm(expected.dateText) === norm(predicted.dateText)
    && norm(expected.event) !== norm(predicted.event) && !pageContains(pages, expected.event)) {
    return { failure: "benchmark ambiguity", detail: `Labeled event "${expected.event}" does not appear on the page. The date and date text match.` };
  }
  if (valueMatch(expected, predicted) && !evidenceCovers(expected, predicted)) {
    return { failure: "evidence anchoring", detail: "Payload matches, and the evidence excerpt does not cover the labeled excerpt." };
  }
  if (!normalizedPayload(expected, predicted) && looseIdentity(expected, predicted)) {
    return { failure: "normalization", detail: "The fact identity matches, and the amount, unit, or date does not." };
  }
  if (valueMatch(expected, predicted) && evidenceCovers(expected, predicted) && expected.modality !== predicted.modality) {
    return { failure: "model behavior", detail: `Modality is ${predicted.modality}; the label is ${expected.modality}.` };
  }
  if (overlapsNotFact(predicted, notFacts)) {
    return { failure: "benchmark ambiguity", detail: "The prediction overlaps text the benchmark marked as not a fact." };
  }
  return { failure: "model behavior", detail: "The prediction does not match the labeled fact." };
}

function classifyUnexpected(
  predicted: ProposedConstructionFact,
  partials: readonly Link[],
  pages: readonly ConstructionFactPage[],
  notFacts: readonly { pageNumber: number; excerpt: string }[],
): { failure: ExtractionFailure; detail: string } {
  const paired = partials.find((item) => item.predicted === predicted);
  if (paired) return classifyExpected(paired.expected, predicted, pages, notFacts);
  if (overlapsNotFact(predicted, notFacts)) {
    return { failure: "benchmark ambiguity", detail: "The prediction overlaps text the benchmark marked as not a fact." };
  }
  return { failure: "model behavior", detail: "The prediction is not a labeled fact." };
}

function parseExpected(fixture: ConstructionFactsFixture) {
  return parseConstructionFactsV1(goldPrediction(fixture), fixture.pages);
}

function parsePredicted(
  fixture: ConstructionFactsFixture,
  raw: unknown,
): { ok: true; facts: ProposedConstructionFact[] } | { ok: false; failure: ExtractionFailure; detail: string } {
  const candidate = raw ?? { extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version, facts: [] };
  const shape = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
  if (!shape || shape.extractorVersion !== CONSTRUCTION_FACTS_EXTRACTOR.version || !Array.isArray(shape.facts)) {
    return { ok: false, failure: "prompt/schema", detail: "Output is missing the construction-facts-v1 extractor version or facts array." };
  }
  try {
    return { ok: true, facts: parseConstructionFactsV1(candidate, fixture.pages) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model output failed validation.";
    return { ok: false, failure: "parsing", detail: message };
  }
}

function link(expected: ProposedConstructionFact, predicted: ProposedConstructionFact): Link {
  return {
    expected,
    predicted,
    valueMatch: valueMatch(expected, predicted),
    evidenceMatch: evidenceCovers(expected, predicted),
    modalityMatch: expected.modality === predicted.modality,
  };
}

function strictMatch(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  return valueMatch(expected, predicted)
    && expected.modality === predicted.modality
    && evidenceCovers(expected, predicted)
    && (expected.type !== "schedule_date" || predicted.type !== "schedule_date" || norm(expected.event) === norm(predicted.event));
}

function valueMatch(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  if (expected.type !== predicted.type) return false;
  if (expected.type === "equipment_requirement" && predicted.type === "equipment_requirement") {
    return norm(expected.equipment) === norm(predicted.equipment) && norm(expected.statement) === norm(predicted.statement);
  }
  if (expected.type === "schedule_date" && predicted.type === "schedule_date") {
    return expected.date === predicted.date && norm(expected.dateText) === norm(predicted.dateText);
  }
  if (expected.type === "quantity" && predicted.type === "quantity") {
    return norm(expected.subject) === norm(predicted.subject)
      && expected.amount === predicted.amount
      && expected.unit === predicted.unit
      && norm(expected.originalText) === norm(predicted.originalText);
  }
  return false;
}

function normalizedPayload(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  if (expected.type === "schedule_date" && predicted.type === "schedule_date") {
    return expected.date === predicted.date && norm(expected.dateText) === norm(predicted.dateText);
  }
  return valueMatch(expected, predicted);
}

function looseIdentity(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  if (expected.type !== predicted.type) return false;
  if (expected.type === "equipment_requirement" && predicted.type === "equipment_requirement") {
    return norm(expected.equipment) === norm(predicted.equipment);
  }
  if (expected.type === "schedule_date" && predicted.type === "schedule_date") {
    return norm(expected.event) === norm(predicted.event) || expected.date === predicted.date;
  }
  if (expected.type === "quantity" && predicted.type === "quantity") {
    return norm(expected.subject) === norm(predicted.subject) || (expected.amount === predicted.amount && expected.unit === predicted.unit);
  }
  return false;
}

function evidenceCovers(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  const remaining = [...predicted.evidence];
  for (const item of expected.evidence) {
    const index = remaining.findIndex((candidate) => candidate.pageNumber === item.pageNumber && candidate.excerpt.includes(item.excerpt));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function evidenceOverlaps(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  return expected.evidence.some((item) => predicted.evidence.some((candidate) => (
    candidate.pageNumber === item.pageNumber
    && (candidate.excerpt.includes(item.excerpt) || item.excerpt.includes(candidate.excerpt))
  )));
}

function overlapsNotFact(
  fact: ProposedConstructionFact,
  notFacts: readonly { pageNumber: number; excerpt: string }[],
) {
  return fact.evidence.some((item) => notFacts.some((notFact) => (
    notFact.pageNumber === item.pageNumber
    && (item.excerpt.includes(notFact.excerpt) || notFact.excerpt.includes(item.excerpt))
  )));
}

function identityText(fact: ProposedConstructionFact) {
  if (fact.type === "equipment_requirement") return fact.equipment;
  if (fact.type === "schedule_date") return fact.event;
  return fact.subject;
}

function pageContains(pages: readonly ConstructionFactPage[], text: string) {
  const needle = text.trim().toLowerCase();
  return needle.length > 0 && pages.some((page) => page.text.toLowerCase().includes(needle));
}

function labelFact(fact: ProposedConstructionFact) {
  if (fact.type === "equipment_requirement") return `equipment_requirement:${fact.modality}:${fact.equipment}`;
  if (fact.type === "schedule_date") return `schedule_date:${fact.modality}:${fact.event}:${fact.date ?? "unparsed"}`;
  return `quantity:${fact.modality}:${fact.subject}:${fact.amount} ${fact.unit}`;
}

function emptyBucket(): Bucket {
  return {
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    evidenceCorrect: 0,
    evidenceCompared: 0,
    modalityCorrect: 0,
    modalityCompared: 0,
    normalizationCorrect: 0,
    normalizationCompared: 0,
    predictions: 0,
    ungrounded: 0,
    unsupportedHighConfidenceFacts: 0,
  };
}

function bucketFor(buckets: Map<string, Bucket>, key: string) {
  const current = buckets.get(key) ?? emptyBucket();
  buckets.set(key, current);
  return current;
}

function addCounts(bucket: Bucket, delta: Bucket) {
  bucket.truePositives += delta.truePositives;
  bucket.falsePositives += delta.falsePositives;
  bucket.falseNegatives += delta.falseNegatives;
  bucket.evidenceCorrect += delta.evidenceCorrect;
  bucket.evidenceCompared += delta.evidenceCompared;
  bucket.modalityCorrect += delta.modalityCorrect;
  bucket.modalityCompared += delta.modalityCompared;
  bucket.normalizationCorrect += delta.normalizationCorrect;
  bucket.normalizationCompared += delta.normalizationCompared;
  bucket.predictions += delta.predictions;
  bucket.ungrounded += delta.ungrounded;
  bucket.unsupportedHighConfidenceFacts += delta.unsupportedHighConfidenceFacts;
}

function rates(bucket: Bucket): MetricRates {
  const counts = {
    truePositives: bucket.truePositives,
    falsePositives: bucket.falsePositives,
    falseNegatives: bucket.falseNegatives,
  };
  return {
    ...counts,
    precision: precision(counts),
    recall: recall(counts),
    f1: f1(counts),
    evidenceCorrectness: ratio(bucket.evidenceCorrect, bucket.evidenceCompared),
    evidenceCompared: bucket.evidenceCompared,
    hallucinatedFactRate: bucket.predictions === 0 ? 0 : bucket.ungrounded / bucket.predictions,
    modalityCorrectness: ratio(bucket.modalityCorrect, bucket.modalityCompared),
    modalityCompared: bucket.modalityCompared,
    normalizationCorrectness: ratio(bucket.normalizationCorrect, bucket.normalizationCompared),
    normalizationCompared: bucket.normalizationCompared,
    unsupportedHighConfidenceFacts: bucket.unsupportedHighConfidenceFacts,
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function target(goal: number, actual: number, compared: boolean): TargetResult {
  return { goal, actual, achieved: compared && actual >= goal };
}

function norm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatMetric(value: number) {
  return value.toFixed(3);
}
