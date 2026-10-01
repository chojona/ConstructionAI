import { PIPELINE_STAGES, type PipelineStage, type ProcessingRunTiming, type StageOutcome } from "./pipelineTiming";

export interface StageLatencySummary {
  stage: PipelineStage;
  samples: number;
  successes: number;
  failures: number;
  timeouts: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface LatencySummary {
  runs: number;
  successes: number;
  failures: number;
  timeouts: number;
  total: { p50Ms: number | null; p95Ms: number | null };
  stages: StageLatencySummary[];
  bottleneck: { stage: PipelineStage; p95Ms: number } | null;
}

export function percentile(values: readonly number[], percentileRank: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0] ?? null;
  const rank = (percentileRank / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lower = sorted[low] ?? 0;
  const upper = sorted[high] ?? lower;
  return roundMs(lower + (upper - lower) * (rank - low));
}

export function summarizeLatency(runs: readonly ProcessingRunTiming[]): LatencySummary {
  const stages = PIPELINE_STAGES.map((stage) => summarizeStage(stage, runs)).filter((stage) => stage.samples > 0);
  const successfulTotals = runs.filter((run) => run.outcome === "success").map((run) => run.totalDurationMs);
  return {
    runs: runs.length,
    successes: runs.filter((run) => run.outcome === "success").length,
    failures: runs.filter((run) => run.outcome === "failure").length,
    timeouts: runs.filter((run) => run.outcome === "timeout").length,
    total: { p50Ms: percentile(successfulTotals, 50), p95Ms: percentile(successfulTotals, 95) },
    stages,
    bottleneck: bottleneckOf(stages),
  };
}

export function formatLatencyReport(summary: LatencySummary, meta: {
  generatedAt: string;
  iterations: number;
  notes: readonly string[];
  workload: readonly string[];
  title?: string;
}): string {
  const lines = [
    `# ${meta.title ?? "Document intelligence latency benchmark"}`,
    "",
    `Generated: ${meta.generatedAt}`,
    `Successful-run samples used for percentiles: ${summary.successes} of ${summary.runs} runs (${meta.iterations} requested).`,
    `Failures: ${summary.failures}. Timeouts: ${summary.timeouts}.`,
    "",
    "Percentiles use successful stage samples only. A timeout or failure stays out of the p50/p95 distribution, including when it returns faster than a slow success.",
    "",
    "## Workload",
    ...meta.workload.map((line) => `- ${line}`),
    "",
    "## Stage latency",
    "",
    "| Stage | Successes | Failures | Timeouts | p50 ms | p95 ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...summary.stages.map((stage) => `| ${stage.stage} | ${stage.successes} | ${stage.failures} | ${stage.timeouts} | ${formatMs(stage.p50Ms)} | ${formatMs(stage.p95Ms)} |`),
    `| end_to_end | ${summary.successes} | ${summary.failures} | ${summary.timeouts} | ${formatMs(summary.total.p50Ms)} | ${formatMs(summary.total.p95Ms)} |`,
    "",
    "## Bottleneck",
    "",
    summary.bottleneck
      ? `The slowest successful stage by p95 is \`${summary.bottleneck.stage}\` at ${formatMs(summary.bottleneck.p95Ms)} ms. Optimization should start there.`
      : "No successful stage samples were recorded, so a bottleneck cannot be named yet.",
    "",
    "## Notes",
    ...meta.notes.map((line) => `- ${line}`),
    "",
  ];
  return lines.join("\n");
}

function summarizeStage(stage: PipelineStage, runs: readonly ProcessingRunTiming[]): StageLatencySummary {
  const samples = runs.flatMap((run) => run.stages.filter((item) => item.stage === stage));
  const successes = samples.filter((sample) => sample.outcome === "success");
  return {
    stage,
    samples: samples.length,
    successes: successes.length,
    failures: count(samples, "failure"),
    timeouts: count(samples, "timeout"),
    p50Ms: percentile(successes.map((sample) => sample.durationMs), 50),
    p95Ms: percentile(successes.map((sample) => sample.durationMs), 95),
  };
}

function bottleneckOf(stages: readonly StageLatencySummary[]) {
  const ranked = stages.filter((stage): stage is StageLatencySummary & { p95Ms: number } => stage.p95Ms !== null);
  ranked.sort((left, right) => right.p95Ms - left.p95Ms || PIPELINE_STAGES.indexOf(left.stage) - PIPELINE_STAGES.indexOf(right.stage));
  const slowest = ranked[0];
  return slowest ? { stage: slowest.stage, p95Ms: slowest.p95Ms } : null;
}

function count(samples: readonly { outcome: StageOutcome }[], outcome: StageOutcome) {
  return samples.filter((sample) => sample.outcome === outcome).length;
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatMs(value: number | null) {
  return value === null ? "—" : value.toFixed(3);
}
