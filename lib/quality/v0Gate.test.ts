import { describe, expect, it } from "vitest";
import { formatV0QualitySnapshot, qualityTargetsMet, type V0QualitySnapshot } from "./v0Gate";

const snapshot: V0QualitySnapshot = {
  extraction: {
    model: "deterministic/construction-facts-rules-v1",
    precision: 1,
    recall: 1,
    f1: 1,
    evidenceCorrectness: 1,
    evidenceCompared: 34,
    unsupportedHighConfidenceFacts: 0,
    misses: 0,
    targetsMet: true,
  },
  changes: {
    materialPrecision: 1,
    materialRecall: 1,
    falseHighRate: 0,
    falseHighFindings: 0,
    highFindings: 7,
    criticalFindings: 0,
    evidenceCorrectness: 1,
    misses: 0,
    targetsMet: true,
  },
  latency: { successes: 31, runs: 31, failures: 0, timeouts: 0, p50Ms: 2.795, p95Ms: 5.454 },
};

describe("V0 quality snapshot", () => {
  it("prints the gate metrics without failure traces", () => {
    expect(qualityTargetsMet(snapshot)).toBe(true);
    expect(formatV0QualitySnapshot(snapshot)).toBe([
      "deterministic/construction-facts-rules-v1",
      "extraction precision 1.000 recall 1.000 f1 1.000",
      "evidence correctness 1.000 compared 34",
      "unsupported high-confidence facts 0",
      "material precision 1.000 recall 1.000",
      "false high-severity 0/7 rate 0.000",
      "latency p50 2.795 ms p95 5.454 ms failures 0 timeouts 0",
      "targets met true",
    ].join("\n"));
  });
});
