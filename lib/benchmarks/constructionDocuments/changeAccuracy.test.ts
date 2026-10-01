import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyChangeMiss, measureRevisionChangeAccuracy } from "./changeAccuracy";
import { revisionChangeCases } from "./changeCases";

const reportPath = path.join(process.cwd(), "benchmarks", "construction-documents", "reports", "change-accuracy.json");

describe("revision change accuracy", () => {
  it("scores human-labeled revision pairs and stores the measured report", () => {
    const cases = revisionChangeCases();
    const report = measureRevisionChangeAccuracy(cases);
    const stored = JSON.parse(readFileSync(reportPath, "utf8")) as typeof report;
    const phenomena = new Set(cases.flatMap((changeCase) => changeCase.phenomena));

    expect(cases.filter((changeCase) => changeCase.source === "construction-documents-v1").length).toBeGreaterThanOrEqual(10);
    for (const tag of ["added", "removed", "modified", "wording-only", "date-normalization", "unit-normalization", "reordered", "repeated", "evidence"]) {
      expect(phenomena.has(tag as never)).toBe(true);
    }
    expect(report.predictionSource).toBe("deterministic-comparison");
    expect(report.byType.ADDED.precision).toBe(1);
    expect(report.byType.REMOVED.precision).toBe(1);
    expect(report.byType.MODIFIED.precision).toBe(1);
    expect(report.byType.ADDED.recall).toBe(1);
    expect(report.byType.REMOVED.recall).toBe(1);
    expect(report.byType.MODIFIED.recall).toBe(1);
    expect(report.material.precision).toBeGreaterThanOrEqual(0.98);
    expect(report.material.recall).toBeGreaterThanOrEqual(0.95);
    expect(report.wordingSuppression).toBe(1);
    expect(report.normalizationLeaks).toBe(0);
    expect(report.highFindings).toBeGreaterThan(0);
    expect(report.falseHighFindings).toBe(0);
    expect(report.targets.falseHighRate.actual).toBeLessThan(0.01);
    expect(report.evidenceCompared).toBeGreaterThan(0);
    expect(report.evidenceCorrectness).toBe(1);
    expect(report.byPhenomenon["date-normalization"]?.materialLeaks).toBe(0);
    expect(report.byPhenomenon["unit-normalization"]?.materialLeaks).toBe(0);
    expect(report.byPhenomenon["wording-only"]?.materialLeaks).toBe(0);
    expect(report.byPhenomenon.repeated?.falsePositives).toBe(0);
    expect(report.byPhenomenon.reordered?.falsePositives).toBe(0);
    expect(report.misses).toEqual([]);
    expect(report.targets.materialPrecision.achieved).toBe(report.material.precision >= 0.98);
    expect(report.targets.materialRecall.achieved).toBe(report.material.recall >= 0.95);
    expect(report.targets.falseHighRate.achieved).toBe(report.targets.falseHighRate.actual < 0.01);
    expect(report.targets.allMeasuredTargetsMet).toBe(true);
    expect(stored.overall).toEqual(report.overall);
    expect(stored.byType).toEqual(report.byType);
    expect(stored.material).toEqual(report.material);
    expect(stored.targets).toEqual(report.targets);
    expect(stored.byPhenomenon).toEqual(report.byPhenomenon);
    expect(stored.misses).toEqual(report.misses);
  });

  it("classifies a miss by the case that produced it", () => {
    expect(classifyChangeMiss(["unit-normalization", "wording-only"], "MODIFIED", false)).toBe("unit normalization");
    expect(classifyChangeMiss(["repeated", "unit-normalization"], "MODIFIED", false)).toBe("repeated fact pairing");
    expect(classifyChangeMiss(["date-normalization"], "MODIFIED", false)).toBe("date normalization");
    expect(classifyChangeMiss(["wording-only"], "MODIFIED", false)).toBe("wording suppression");
    expect(classifyChangeMiss(["reordered"], null, false)).toBe("reorder");
    expect(classifyChangeMiss(["added"], "ADDED", true)).toBe("evidence");
    expect(classifyChangeMiss(["added"], "ADDED", false)).toBe("added mismatch");
    expect(classifyChangeMiss(["removed"], "REMOVED", false)).toBe("removed mismatch");
  });
});
