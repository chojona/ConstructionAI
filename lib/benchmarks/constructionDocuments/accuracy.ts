import { constructionDocumentFixtures } from "./evaluate";
import { CONSTRUCTION_DOCUMENT_BENCHMARK, type BenchmarkPhenomenon, type ConstructionDocumentBenchmark } from "./dataset";
import {
  DETERMINISTIC_CONSTRUCTION_FACTS_MODEL,
  extractConstructionFacts,
} from "@/lib/extractions/deterministicExtractor";
import {
  scoreExtractionQuality,
  type ExtractionQualityReport,
  type QualityContext,
} from "@/lib/extractions/eval/quality";

const languageTags = new Set(["conditional", "contradictory", "tentative", "historical", "proposed"]);

export function constructionDocumentModelPredictions(benchmark: ConstructionDocumentBenchmark = CONSTRUCTION_DOCUMENT_BENCHMARK) {
  const predictions: Record<string, unknown> = {};
  for (const pair of benchmark.pairs) {
    predictions[`${pair.id}:base`] = extractConstructionFacts(pair.base.pages);
    predictions[`${pair.id}:revised`] = extractConstructionFacts(pair.revised.pages);
  }
  return predictions;
}

export function measureConstructionDocumentAccuracy(
  benchmark: ConstructionDocumentBenchmark = CONSTRUCTION_DOCUMENT_BENCHMARK,
): ExtractionQualityReport {
  const fixtures = constructionDocumentFixtures(benchmark);
  const context: Record<string, QualityContext> = {};
  for (const pair of benchmark.pairs) {
    context[`${pair.id}:base`] = sideContext(pair.phenomena, pair.base.expected, pair.base.notFacts);
    context[`${pair.id}:revised`] = sideContext(pair.phenomena, pair.revised.expected, pair.revised.notFacts);
  }
  return scoreExtractionQuality(fixtures, constructionDocumentModelPredictions(benchmark), {
    provider: DETERMINISTIC_CONSTRUCTION_FACTS_MODEL.provider,
    model: DETERMINISTIC_CONSTRUCTION_FACTS_MODEL.model,
    context,
  });
}

function sideContext(
  phenomena: readonly BenchmarkPhenomenon[],
  expected: readonly { modality: string }[],
  notFacts: QualityContext["notFacts"],
): QualityContext {
  const tags = new Set<string>(phenomena);
  for (const fact of expected) {
    if (fact.modality !== "asserted") tags.add(fact.modality);
  }
  if ([...tags].some((tag) => languageTags.has(tag))) tags.add("difficult-language");
  return { notFacts, difficulty: [...tags].sort() };
}
