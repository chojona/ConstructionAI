import { readFile } from "node:fs/promises";
import path from "node:path";

type Target = { goal: number; actual: number; achieved: boolean };

export type V0QualitySnapshot = {
  extraction: {
    model: string;
    precision: number;
    recall: number;
    f1: number;
    evidenceCorrectness: number;
    evidenceCompared: number;
    unsupportedHighConfidenceFacts: number;
    misses: number;
    targetsMet: boolean;
  };
  changes: {
    materialPrecision: number;
    materialRecall: number;
    falseHighRate: number;
    falseHighFindings: number;
    highFindings: number;
    criticalFindings: number;
    evidenceCorrectness: number;
    misses: number;
    targetsMet: boolean;
  };
  latency: {
    successes: number;
    runs: number;
    failures: number;
    timeouts: number;
    p50Ms: number;
    p95Ms: number;
  };
};

export async function readV0QualitySnapshot(root = process.cwd()): Promise<V0QualitySnapshot> {
  const extraction = JSON.parse(await readFile(path.join(root, "benchmarks/construction-documents/reports/extraction-accuracy.json"), "utf8")) as {
    model: { provider: string; model: string };
    overall: { precision: number; recall: number; f1: number; evidenceCorrectness: number; evidenceCompared: number; unsupportedHighConfidenceFacts: number };
    targets: { allMeasuredTargetsMet: boolean };
    misses: unknown[];
  };
  const changes = JSON.parse(await readFile(path.join(root, "benchmarks/construction-documents/reports/change-accuracy.json"), "utf8")) as {
    material: { precision: number; recall: number };
    targets: { falseHighRate: Target; allMeasuredTargetsMet: boolean };
    falseHighFindings: number;
    highFindings: number;
    criticalFindings: number;
    evidenceCorrectness: number;
    misses: unknown[];
  };
  const latency = await readFile(path.join(root, "benchmarks/latency/optimized.md"), "utf8");
  const samples = latency.match(/Successful-run samples used for percentiles: (\d+) of (\d+) runs/);
  const failures = latency.match(/Failures: (\d+)\. Timeouts: (\d+)\./);
  const endToEnd = latency.match(/\| end_to_end \| (\d+) \| (\d+) \| (\d+) \| ([0-9.]+) \| ([0-9.]+) \|/);
  if (!samples || !failures || !endToEnd) throw new Error("Latency report is missing the end-to-end percentile row.");
  return {
    extraction: {
      model: `${extraction.model.provider}/${extraction.model.model}`,
      precision: extraction.overall.precision,
      recall: extraction.overall.recall,
      f1: extraction.overall.f1,
      evidenceCorrectness: extraction.overall.evidenceCorrectness,
      evidenceCompared: extraction.overall.evidenceCompared,
      unsupportedHighConfidenceFacts: extraction.overall.unsupportedHighConfidenceFacts,
      misses: extraction.misses.length,
      targetsMet: extraction.targets.allMeasuredTargetsMet,
    },
    changes: {
      materialPrecision: changes.material.precision,
      materialRecall: changes.material.recall,
      falseHighRate: changes.targets.falseHighRate.actual,
      falseHighFindings: changes.falseHighFindings,
      highFindings: changes.highFindings,
      criticalFindings: changes.criticalFindings,
      evidenceCorrectness: changes.evidenceCorrectness,
      misses: changes.misses.length,
      targetsMet: changes.targets.allMeasuredTargetsMet,
    },
    latency: {
      successes: Number(samples[1]),
      runs: Number(samples[2]),
      failures: Number(failures[1]),
      timeouts: Number(failures[2]),
      p50Ms: Number(endToEnd[4]),
      p95Ms: Number(endToEnd[5]),
    },
  };
}

export function qualityTargetsMet(snapshot: V0QualitySnapshot) {
  return snapshot.extraction.targetsMet
    && snapshot.changes.targetsMet
    && snapshot.extraction.misses === 0
    && snapshot.changes.misses === 0
    && snapshot.latency.failures === 0
    && snapshot.latency.timeouts === 0
    && snapshot.latency.successes === snapshot.latency.runs;
}

export function formatV0QualitySnapshot(snapshot: V0QualitySnapshot) {
  const rate = (value: number) => value.toFixed(3);
  return [
    `${snapshot.extraction.model}`,
    `extraction precision ${rate(snapshot.extraction.precision)} recall ${rate(snapshot.extraction.recall)} f1 ${rate(snapshot.extraction.f1)}`,
    `evidence correctness ${rate(snapshot.extraction.evidenceCorrectness)} compared ${snapshot.extraction.evidenceCompared}`,
    `unsupported high-confidence facts ${snapshot.extraction.unsupportedHighConfidenceFacts}`,
    `material precision ${rate(snapshot.changes.materialPrecision)} recall ${rate(snapshot.changes.materialRecall)}`,
    `false high-severity ${snapshot.changes.falseHighFindings}/${snapshot.changes.highFindings + snapshot.changes.criticalFindings} rate ${rate(snapshot.changes.falseHighRate)}`,
    `latency p50 ${snapshot.latency.p50Ms.toFixed(3)} ms p95 ${snapshot.latency.p95Ms.toFixed(3)} ms failures ${snapshot.latency.failures} timeouts ${snapshot.latency.timeouts}`,
    `targets met ${qualityTargetsMet(snapshot)}`,
  ].join("\n");
}
