import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { runLatencyBenchmark, withBenchmarkStorage } from "./latencyBenchmark";

describe("document intelligence latency benchmark", () => {
  it("times every pipeline stage and keeps source text out of the report", async () => {
    const repository = new MemoryRepository();
    const result = await withBenchmarkStorage((storage) => runLatencyBenchmark({
      iterations: 1,
      pages: 2,
      repository,
      storage,
    }));
    const stages = result.runs[0]?.stages.map((stage) => stage.stage) ?? [];
    expect(stages).toEqual(expect.arrayContaining([
      "upload_validation",
      "storage",
      "pdf_parsing",
      "ai_extraction",
      "structured_output_validation",
      "proposed_fact_persistence",
      "revision_comparison",
      "review_attention",
    ]));
    expect(result.runs[0]?.outcome).toBe("success");
    expect(result.summary.total.p50Ms).not.toBeNull();
    expect(result.summary.bottleneck).not.toBeNull();
    const serialized = JSON.stringify(result.runs) + result.report;
    expect(serialized).not.toContain("Excavation quantity");
    expect(serialized).not.toContain("Benchmark filler");
    expect(serialized).not.toContain("baseline-a.pdf");
    expect(result.report).toContain("end_to_end");
  });
});
