import { describe, expect, it } from "vitest";
import {
  PipelineTimeoutError,
  isPipelineTimeout,
  pipelineTimingLog,
  sanitizeStageContext,
  startProcessingRun,
  withProcessingRun,
} from "./pipelineTiming";

describe("processing run timings", () => {
  it("records stage durations and keeps source text out of the timing record", async () => {
    let now = 0;
    const run = startProcessingRun({ id: "run-1", kind: "ingest", now: () => now });
    await run.stage("upload_validation", async () => {
      now += 4;
    }, { byteSize: 1200 });
    expect(sanitizeStageContext({ byteSize: 1200, pageText: "CONFIDENTIAL sheet note" })).toEqual({ byteSize: 1200 });
    await run.stage("pdf_parsing", async () => {
      now += 30;
      return { pageCount: 2 };
    }, () => ({ pageCount: 2, pageTextBytes: 80 }));

    const timing = run.finish();
    expect(timing).toMatchObject({
      id: "run-1",
      kind: "ingest",
      outcome: "success",
      totalDurationMs: 34,
      context: { byteSize: 1200, pageCount: 2, pageTextBytes: 80 },
    });
    expect(timing.stages.map((stage) => [stage.stage, stage.durationMs, stage.outcome])).toEqual([
      ["upload_validation", 4, "success"],
      ["pdf_parsing", 30, "success"],
    ]);
    expect(JSON.stringify(timing)).not.toContain("CONFIDENTIAL");
    expect(sanitizeStageContext({ failureCode: "not a code", byteSize: -1, pageCount: 3 })).toEqual({ pageCount: 3 });
  });

  it("marks timeouts separately from slow successes and ordinary failures", async () => {
    let now = 0;
    const slow = startProcessingRun({ now: () => now });
    await slow.stage("ai_extraction", async () => {
      now += 900;
    });
    expect(slow.finish().stages[0]).toMatchObject({ outcome: "success", durationMs: 900 });

    const timedOut = startProcessingRun({ now: () => 0 });
    await expect(timedOut.stage("ai_extraction", () => {
      throw new PipelineTimeoutError();
    })).rejects.toBeInstanceOf(PipelineTimeoutError);
    expect(timedOut.finish()).toMatchObject({
      outcome: "timeout",
      stages: [{ stage: "ai_extraction", outcome: "timeout", context: { failureCode: "TIMEOUT" } }],
    });

    const failed = startProcessingRun({ now: () => 0 });
    await expect(failed.stage("ai_extraction", () => {
      throw new Error("timeout");
    })).rejects.toThrow("timeout");
    expect(failed.finish().stages[0]?.outcome).toBe("failure");
    expect(isPipelineTimeout(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
    expect(isPipelineTimeout(new Error("timeout"))).toBe(false);
  });

  it("publishes an owned run and leaves a caller-owned run open", async () => {
    pipelineTimingLog.clear();
    const owned = await withProcessingRun(undefined, "ingest", async (run) => {
      await run.stage("storage", async () => undefined, { byteSize: 10 });
      return "stored";
    });
    expect(owned).toBe("stored");
    expect(pipelineTimingLog.list()).toMatchObject([{ kind: "ingest", outcome: "success", stages: [{ stage: "storage" }] }]);

    const caller = startProcessingRun({ kind: "pipeline" });
    await expect(withProcessingRun(caller, "ingest", async (run) => {
      await run.stage("upload_validation", () => {
        throw Object.assign(new Error("too large"), { code: "FILE_TOO_LARGE" });
      });
    })).rejects.toThrow("too large");
    expect(pipelineTimingLog.list()).toHaveLength(1);
    expect(caller.finish()).toMatchObject({
      outcome: "failure",
      stages: [{ stage: "upload_validation", outcome: "failure", context: { failureCode: "FILE_TOO_LARGE" } }],
    });
  });
});
