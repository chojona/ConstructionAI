import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { goldBaselinePredictions } from "@/lib/extractions/eval/score";
import { CONSTRUCTION_DOCUMENT_BENCHMARK } from "./dataset";
import { constructionDocumentFixtures } from "./evaluate";
import {
  constructionDocumentModelPredictions,
  measureConstructionDocumentAccuracy,
} from "./accuracy";

const reportPath = path.join(process.cwd(), "benchmarks", "construction-documents", "reports", "extraction-accuracy.json");

describe("construction document extraction accuracy", () => {
  it("scores deterministic model predictions and stores the measured report", () => {
    const fixtures = constructionDocumentFixtures(CONSTRUCTION_DOCUMENT_BENCHMARK);
    const gold = goldBaselinePredictions(fixtures);
    const predictions = constructionDocumentModelPredictions();
    const report = measureConstructionDocumentAccuracy();
    const stored = JSON.parse(readFileSync(reportPath, "utf8")) as typeof report;

    expect(predictions["catawba-drawing-dates:base"]).not.toEqual(gold["catawba-drawing-dates:base"]);
    expect(report.predictionSource).toBe("model");
    expect(report.model).toEqual({ provider: "deterministic", model: "construction-facts-rules-v1" });
    expect(report.byType.equipment_requirement).toMatchObject({ precision: 1, recall: 1 });
    expect(report.byType.quantity).toMatchObject({ precision: 1, recall: 1 });
    expect(report.byType.schedule_date?.recall).toBeLessThan(1);
    expect(report.byDifficulty["date-format"]?.recall).toBeLessThan(1);
    expect(report.byDifficulty["difficult-language"]?.recall).toBe(1);
    expect(report.misses.length).toBeGreaterThan(0);
    expect(report.misses.every((miss) => miss.failure === "benchmark ambiguity")).toBe(true);
    expect(report.misses.every((miss) => miss.fixtureId.startsWith("catawba-drawing-dates"))).toBe(true);
    expect(report.targets.precision.achieved).toBe(report.overall.precision >= 0.98);
    expect(report.targets.recall.achieved).toBe(report.overall.recall >= 0.95);
    expect(report.targets.evidenceCorrectness.achieved).toBe(
      report.overall.evidenceCompared > 0 && report.overall.evidenceCorrectness >= 0.99,
    );
    expect(report.targets.unsupportedHighConfidenceFacts.achieved).toBe(report.overall.unsupportedHighConfidenceFacts === 0);
    expect(report.targets.allMeasuredTargetsMet).toBe(false);
    expect(stored.overall).toEqual(report.overall);
    expect(stored.targets).toEqual(report.targets);
    expect(stored.byType).toEqual(report.byType);
    expect(stored.byDifficulty).toEqual(report.byDifficulty);
    expect(stored.misses).toEqual(report.misses);
  });
});