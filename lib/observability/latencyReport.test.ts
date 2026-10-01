import { describe, expect, it } from "vitest";
import { formatLatencyReport, percentile, summarizeLatency } from "./latencyReport";
import type { ProcessingRunTiming } from "./pipelineTiming";

function run(id: string, outcome: ProcessingRunTiming["outcome"], total: number, stages: ProcessingRunTiming["stages"]): ProcessingRunTiming {
  return { id, kind: "document_intelligence", outcome, totalDurationMs: total, stages, context: { byteSize: 2000, pageCount: 4 } };
}

describe("latency report", () => {
  it("reports p50 and p95 for successes and excludes timeouts from that distribution", () => {
    const summary = summarizeLatency([
      run("slow", "success", 500, [{ stage: "ai_extraction", durationMs: 500, outcome: "success", context: { byteSize: 2000 } }]),
      run("fast", "success", 100, [{ stage: "ai_extraction", durationMs: 100, outcome: "success", context: {} }]),
      run("timed-out", "timeout", 5, [{ stage: "ai_extraction", durationMs: 5, outcome: "timeout", context: { failureCode: "TIMEOUT" } }]),
      run("failed", "failure", 8, [{ stage: "pdf_parsing", durationMs: 8, outcome: "failure", context: { failureCode: "MALFORMED_PDF" } }]),
    ]);

    expect(percentile([100, 500], 50)).toBe(300);
    expect(percentile([100, 500], 95)).toBe(480);
    expect(summary.successes).toBe(2);
    expect(summary.timeouts).toBe(1);
    expect(summary.failures).toBe(1);
    expect(summary.total).toEqual({ p50Ms: 300, p95Ms: 480 });
    expect(summary.stages.find((stage) => stage.stage === "ai_extraction")).toMatchObject({
      successes: 2,
      timeouts: 1,
      p50Ms: 300,
      p95Ms: 480,
    });
    expect(summary.bottleneck).toEqual({ stage: "ai_extraction", p95Ms: 480 });

    const report = formatLatencyReport(summary, {
      generatedAt: "2026-09-30T00:00:00.000Z",
      iterations: 4,
      workload: ["pages 4", "bytes 2000"],
      notes: ["Local model stub."],
    });
    expect(report).toContain("p95");
    expect(report).toContain("`ai_extraction`");
    expect(report).not.toContain("TIMEOUT");
    expect(report).not.toContain("sheet");
  });
});
