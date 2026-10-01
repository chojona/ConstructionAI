import {
  CONSTRUCTION_FACTS_EXTRACTOR,
  parseConstructionFactsV1,
  type ProposedConstructionFact,
} from "../constructionFacts";
import { goldPrediction, type ConstructionFactsFixture } from "./fixtures";

export type ScoreCounts = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
};

export type FixtureScore = ScoreCounts & {
  id: string;
  malformed: boolean;
  missed: string[];
  unexpected: string[];
};

export type EvalReport = ScoreCounts & {
  extractorVersion: typeof CONSTRUCTION_FACTS_EXTRACTOR.version;
  fixtures: FixtureScore[];
  byType: Record<string, ScoreCounts>;
};

export function precision(counts: ScoreCounts) {
  const denominator = counts.truePositives + counts.falsePositives;
  return denominator === 0 ? 1 : counts.truePositives / denominator;
}

export function recall(counts: ScoreCounts) {
  const denominator = counts.truePositives + counts.falseNegatives;
  return denominator === 0 ? 1 : counts.truePositives / denominator;
}

export function f1(counts: ScoreCounts) {
  const matchedPrecision = precision(counts);
  const matchedRecall = recall(counts);
  if (matchedPrecision + matchedRecall === 0) return 0;
  return (2 * matchedPrecision * matchedRecall) / (matchedPrecision + matchedRecall);
}

export function scoreConstructionFactsEval(
  fixtures: readonly ConstructionFactsFixture[],
  predictions: Readonly<Record<string, unknown>>,
): EvalReport {
  const scored = fixtures.map((fixture) => scoreFixture(fixture, predictions[fixture.id]));
  const byType: Record<string, ScoreCounts> = {};
  for (const fixture of fixtures) {
    addTypeCounts(byType, fixture, predictions[fixture.id]);
  }
  return {
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    fixtures: scored,
    byType,
    truePositives: sum(scored, "truePositives"),
    falsePositives: sum(scored, "falsePositives"),
    falseNegatives: sum(scored, "falseNegatives"),
  };
}

export function formatEvalReport(report: EvalReport) {
  const lines = [
    `${report.extractorVersion} extraction eval`,
    `${report.fixtures.length} fixtures`,
    `precision ${formatMetric(precision(report))}`,
    `recall ${formatMetric(recall(report))}`,
    `f1 ${formatMetric(f1(report))}`,
    `true positives ${report.truePositives}`,
    `false positives ${report.falsePositives}`,
    `false negatives ${report.falseNegatives}`,
    "",
  ];
  for (const [type, counts] of Object.entries(report.byType)) {
    lines.push(
      `${type}  precision ${formatMetric(precision(counts))}  recall ${formatMetric(recall(counts))}`,
    );
  }
  lines.push("");
  for (const fixture of report.fixtures) {
    const status = fixture.malformed ? " malformed" : "";
    lines.push(
      `${fixture.id}  precision ${formatMetric(precision(fixture))}  recall ${formatMetric(recall(fixture))}${status}`,
    );
    for (const missed of fixture.missed) lines.push(`  missed ${missed}`);
    for (const unexpected of fixture.unexpected) lines.push(`  unexpected ${unexpected}`);
  }
  return lines.join("\n");
}

export function goldBaselinePredictions(fixtures: readonly ConstructionFactsFixture[]) {
  return Object.fromEntries(fixtures.map((fixture) => [fixture.id, goldPrediction(fixture)]));
}

function scoreFixture(fixture: ConstructionFactsFixture, raw: unknown): FixtureScore {
  const expected = parseExpected(fixture);
  const predicted = parsePrediction(fixture, raw);
  if (!predicted.ok) {
    return {
      id: fixture.id,
      malformed: true,
      truePositives: 0,
      falsePositives: 1,
      falseNegatives: expected.length,
      missed: expected.map(describeFact),
      unexpected: ["malformed output"],
    };
  }

  const remaining = [...predicted.facts];
  const missed: string[] = [];
  let truePositives = 0;
  for (const fact of expected) {
    const index = remaining.findIndex((candidate) => sameFact(fact, candidate));
    if (index < 0) {
      missed.push(describeFact(fact));
      continue;
    }
    truePositives += 1;
    remaining.splice(index, 1);
  }
  return {
    id: fixture.id,
    malformed: false,
    truePositives,
    falsePositives: remaining.length,
    falseNegatives: missed.length,
    missed,
    unexpected: remaining.map(describeFact),
  };
}

function parseExpected(fixture: ConstructionFactsFixture) {
  return parseConstructionFactsV1(goldPrediction(fixture), fixture.pages);
}

function parsePrediction(
  fixture: ConstructionFactsFixture,
  raw: unknown,
): { ok: true; facts: ProposedConstructionFact[] } | { ok: false } {
  const candidate = raw ?? {
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    facts: [],
  };
  try {
    return { ok: true, facts: parseConstructionFactsV1(candidate, fixture.pages) };
  } catch {
    return { ok: false };
  }
}

function sameFact(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  if (expected.type !== predicted.type || expected.modality !== predicted.modality) return false;
  if (!evidenceCovers(expected, predicted)) return false;
  if (expected.type === "equipment_requirement" && predicted.type === "equipment_requirement") {
    return norm(expected.equipment) === norm(predicted.equipment)
      && norm(expected.statement) === norm(predicted.statement);
  }
  if (expected.type === "schedule_date" && predicted.type === "schedule_date") {
    return norm(expected.event) === norm(predicted.event)
      && expected.date === predicted.date
      && norm(expected.dateText) === norm(predicted.dateText);
  }
  if (expected.type === "quantity" && predicted.type === "quantity") {
    return norm(expected.subject) === norm(predicted.subject)
      && expected.amount === predicted.amount
      && expected.unit === predicted.unit
      && norm(expected.originalText) === norm(predicted.originalText);
  }
  return false;
}

function evidenceCovers(expected: ProposedConstructionFact, predicted: ProposedConstructionFact) {
  const remaining = [...predicted.evidence];
  for (const item of expected.evidence) {
    const index = remaining.findIndex((candidate) => (
      candidate.pageNumber === item.pageNumber && candidate.excerpt.includes(item.excerpt)
    ));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function addTypeCounts(
  byType: Record<string, ScoreCounts>,
  fixture: ConstructionFactsFixture,
  raw: unknown,
) {
  const score = scoreFixture(fixture, raw);
  const expected = score.malformed ? [] : parseExpected(fixture);
  const predicted = parsePrediction(fixture, raw);
  if (!predicted.ok) {
    bump(byType, "malformed", { truePositives: 0, falsePositives: 1, falseNegatives: 0 });
    for (const fact of parseExpected(fixture)) {
      bump(byType, fact.type, { truePositives: 0, falsePositives: 0, falseNegatives: 1 });
    }
    return;
  }
  const remaining = [...predicted.facts];
  for (const fact of expected) {
    const index = remaining.findIndex((candidate) => sameFact(fact, candidate));
    if (index < 0) {
      bump(byType, fact.type, { truePositives: 0, falsePositives: 0, falseNegatives: 1 });
      continue;
    }
    bump(byType, fact.type, { truePositives: 1, falsePositives: 0, falseNegatives: 0 });
    remaining.splice(index, 1);
  }
  for (const fact of remaining) {
    bump(byType, fact.type, { truePositives: 0, falsePositives: 1, falseNegatives: 0 });
  }
}

function bump(byType: Record<string, ScoreCounts>, type: string, delta: ScoreCounts) {
  const current = byType[type] ?? { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
  byType[type] = {
    truePositives: current.truePositives + delta.truePositives,
    falsePositives: current.falsePositives + delta.falsePositives,
    falseNegatives: current.falseNegatives + delta.falseNegatives,
  };
}

function describeFact(fact: ProposedConstructionFact) {
  if (fact.type === "equipment_requirement") {
    return `equipment_requirement:${fact.modality}:${fact.equipment}`;
  }
  if (fact.type === "schedule_date") {
    return `schedule_date:${fact.modality}:${fact.event}:${fact.date ?? "unparsed"}`;
  }
  return `quantity:${fact.modality}:${fact.subject}:${fact.amount} ${fact.unit}`;
}

function norm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sum(scores: readonly FixtureScore[], key: keyof ScoreCounts) {
  return scores.reduce((total, score) => total + score[key], 0);
}

function formatMetric(value: number) {
  return value.toFixed(3);
}
