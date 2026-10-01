import {
  CONSTRUCTION_FACTS_EXTRACTOR,
  parseConstructionFactsV1,
  type ProposedConstructionFact,
} from "@/lib/extractions/constructionFacts";
import { goldPrediction, type ConstructionFactsFixture } from "@/lib/extractions/eval/fixtures";
import {
  goldBaselinePredictions,
  scoreConstructionFactsEval,
  type EvalReport,
  type FixtureScore,
} from "@/lib/extractions/eval/score";
import { compareFacts, factSlotKey, type ComparableFact } from "@/lib/revisions/compareFacts";
import type { BenchmarkChange, BenchmarkPair, BenchmarkSide, ConstructionDocumentBenchmark } from "./dataset";

export type BenchmarkEvaluation = {
  extraction: EvalReport;
  extractionMismatches: FixtureScore[];
  changeMismatches: Array<{ id: string; expected: BenchmarkChange[]; actual: BenchmarkChange[] }>;
};

export function constructionDocumentFixtures(
  benchmark: ConstructionDocumentBenchmark,
): ConstructionFactsFixture[] {
  return benchmark.pairs.flatMap((pair) => [sideFixture(pair, "base"), sideFixture(pair, "revised")]);
}

export function labeledChanges(pair: BenchmarkPair): BenchmarkChange[] {
  return compareFacts(comparableFacts(pair.base), comparableFacts(pair.revised)).map((change) => ({
    changeType: change.changeType,
    category: change.category,
    material: change.material,
    basis: change.basis,
    slot: factSlotKey((change.before ?? change.after)!),
  }));
}

export function evaluateConstructionDocumentBenchmark(
  benchmark: ConstructionDocumentBenchmark,
  predictions?: Readonly<Record<string, unknown>>,
): BenchmarkEvaluation {
  assertSources(benchmark);
  const fixtures = constructionDocumentFixtures(benchmark);
  const extraction = scoreConstructionFactsEval(
    fixtures,
    predictions ?? goldBaselinePredictions(fixtures),
  );
  return {
    extraction,
    extractionMismatches: extraction.fixtures.filter((fixture) => (
      fixture.malformed || fixture.falsePositives > 0 || fixture.falseNegatives > 0
    )),
    changeMismatches: benchmark.pairs.flatMap((pair) => {
      const actual = labeledChanges(pair);
      return sameChanges(pair.expectedChanges, actual) ? [] : [{ id: pair.id, expected: pair.expectedChanges, actual }];
    }),
  };
}

export function formatBenchmarkReport(report: BenchmarkEvaluation) {
  const lines = [
    `${CONSTRUCTION_FACTS_EXTRACTOR.version} construction-document benchmark`,
    `${report.extraction.fixtures.length} revision sides`,
    `precision ${report.extraction.truePositives}/${report.extraction.truePositives + report.extraction.falsePositives}`,
    `change mismatches ${report.changeMismatches.length}`,
  ];
  for (const mismatch of report.changeMismatches) {
    lines.push(`${mismatch.id} expected ${JSON.stringify(mismatch.expected)} actual ${JSON.stringify(mismatch.actual)}`);
  }
  return lines.join("\n");
}

function sideFixture(pair: BenchmarkPair, side: "base" | "revised"): ConstructionFactsFixture {
  const revision = pair[side];
  return {
    id: `${pair.id}:${side}`,
    description: `${pair.description} (${revision.revisionLabel})`,
    pages: revision.pages,
    expected: revision.expected,
  };
}

function comparableFacts(side: BenchmarkSide): ComparableFact[] {
  const fixture: ConstructionFactsFixture = {
    id: side.revisionLabel,
    description: side.revisionLabel,
    pages: side.pages,
    expected: side.expected,
  };
  return parseConstructionFactsV1(goldPrediction(fixture), side.pages).map(toComparable);
}

function toComparable(fact: ProposedConstructionFact, ordinal: number): ComparableFact {
  const evidence = fact.evidence.map((item) => ({ ...item }));
  if (fact.type === "equipment_requirement") {
    return {
      factType: fact.type,
      ordinal,
      evidence,
      payload: { equipment: fact.equipment, statement: fact.statement, modality: fact.modality },
    };
  }
  if (fact.type === "schedule_date") {
    return {
      factType: fact.type,
      ordinal,
      evidence,
      payload: { event: fact.event, date: fact.date, dateText: fact.dateText, modality: fact.modality },
    };
  }
  return {
    factType: fact.type,
    ordinal,
    evidence,
    payload: {
      subject: fact.subject,
      amount: fact.amount,
      unit: fact.unit,
      originalText: fact.originalText,
      modality: fact.modality,
    },
  };
}

function assertSources(benchmark: ConstructionDocumentBenchmark) {
  const ids = new Set<string>();
  for (const pair of benchmark.pairs) {
    if (ids.has(pair.id)) throw new Error(`Duplicate benchmark pair ${pair.id}.`);
    ids.add(pair.id);
    for (const side of [pair.base, pair.revised]) {
      for (const item of side.notFacts) {
        const page = side.pages.find((candidate) => candidate.pageNumber === item.pageNumber);
        if (!page?.text.includes(item.excerpt)) {
          throw new Error(`Not-fact excerpt missing from ${pair.id}: ${item.excerpt}`);
        }
      }
    }
  }
}

function sameChanges(expected: readonly BenchmarkChange[], actual: readonly BenchmarkChange[]) {
  const count = (changes: readonly BenchmarkChange[]) => {
    const totals = new Map<string, number>();
    for (const change of changes) {
      const key = JSON.stringify(change);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return totals;
  };
  const left = count(expected);
  const right = count(actual);
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}
