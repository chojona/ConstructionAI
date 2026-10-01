import { randomUUID } from "node:crypto";

export const PIPELINE_STAGES = [
  "upload_validation",
  "storage",
  "pdf_parsing",
  "ai_extraction",
  "structured_output_validation",
  "proposed_fact_persistence",
  "revision_comparison",
  "review_attention",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type StageOutcome = "success" | "failure" | "timeout";

const CONTEXT_COUNTS = [
  "byteSize",
  "pageCount",
  "pageTextBytes",
  "factCount",
  "changeCount",
  "findingCount",
  "attentionCount",
] as const;

export interface StageContext {
  byteSize?: number;
  pageCount?: number;
  pageTextBytes?: number;
  factCount?: number;
  changeCount?: number;
  findingCount?: number;
  attentionCount?: number;
  failureCode?: string;
}

const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,39}$/;

export interface StageTiming {
  stage: PipelineStage;
  durationMs: number;
  outcome: StageOutcome;
  context: StageContext;
}

export interface ProcessingRunTiming {
  id: string;
  kind: string;
  outcome: StageOutcome;
  totalDurationMs: number;
  stages: StageTiming[];
  context: StageContext;
}

type StageContextInput<T> = StageContext | ((value: T) => StageContext);

const MAX_LOGGED_RUNS = 200;
const loggedRuns: ProcessingRunTiming[] = [];

export const pipelineTimingLog = {
  record(timing: ProcessingRunTiming) {
    loggedRuns.push(timing);
    if (loggedRuns.length > MAX_LOGGED_RUNS) loggedRuns.shift();
  },
  list(): ProcessingRunTiming[] {
    return loggedRuns.map(cloneTiming);
  },
  clear() {
    loggedRuns.length = 0;
  },
};

export class PipelineTimeoutError extends Error {
  readonly code = "TIMEOUT" as const;

  constructor(message = "Stage timed out.") {
    super(message);
    this.name = "PipelineTimeoutError";
  }
}

export function isPipelineTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? error.name : undefined;
  const code = "code" in error ? error.code : undefined;
  return name === "PipelineTimeoutError"
    || name === "TimeoutError"
    || name === "AbortError"
    || code === "TIMEOUT"
    || code === "ETIMEDOUT";
}

export function sanitizeStageContext(input: object | undefined): StageContext {
  if (!input) return {};
  const source = input as Record<string, unknown>;
  const context: StageContext = {};
  for (const key of CONTEXT_COUNTS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      context[key] = value;
    }
  }
  if (typeof source.failureCode === "string" && FAILURE_CODE.test(source.failureCode)) {
    context.failureCode = source.failureCode;
  }
  return context;
}

export function startProcessingRun(options: { id?: string; kind?: string; now?: () => number } = {}) {
  return new ProcessingRun(options.now ?? (() => performance.now()), options);
}

export class ProcessingRun {
  readonly id: string;
  readonly kind: string;
  private readonly stages: StageTiming[] = [];
  private readonly startedAt: number;
  private outcome: StageOutcome = "success";
  private context: StageContext = {};
  private finished: ProcessingRunTiming | null = null;

  constructor(
    private readonly now: () => number,
    options: { id?: string; kind?: string } = {},
  ) {
    this.id = options.id ?? randomUUID();
    this.kind = options.kind ?? "pipeline";
    this.startedAt = this.now();
  }

  async stage<T>(stage: PipelineStage, fn: () => Promise<T> | T, context?: StageContextInput<T>): Promise<T> {
    const started = this.now();
    try {
      const value = await fn();
      this.record(stage, started, "success", resolveContext(context, value));
      return value;
    } catch (error) {
      this.record(stage, started, isPipelineTimeout(error) ? "timeout" : "failure", failureContext(error));
      throw error;
    }
  }

  measure<T>(stage: PipelineStage, fn: () => T, context?: StageContextInput<T>): T {
    const started = this.now();
    try {
      const value = fn();
      this.record(stage, started, "success", resolveContext(context, value));
      return value;
    } catch (error) {
      this.record(stage, started, isPipelineTimeout(error) ? "timeout" : "failure", failureContext(error));
      throw error;
    }
  }

  note(context: StageContext) {
    this.assertOpen();
    this.context = { ...this.context, ...sanitizeStageContext(context) };
  }

  finish(outcome?: StageOutcome): ProcessingRunTiming {
    if (this.finished) return this.finished;
    this.finished = {
      id: this.id,
      kind: this.kind,
      outcome: outcome ? worse(this.outcome, outcome) : this.outcome,
      totalDurationMs: elapsed(this.startedAt, this.now()),
      stages: this.stages.map(cloneStage),
      context: { ...this.context },
    };
    return this.finished;
  }

  private record(stage: PipelineStage, started: number, outcome: StageOutcome, context: StageContext | undefined) {
    this.assertOpen();
    const safe = sanitizeStageContext(context);
    this.stages.push({
      stage,
      durationMs: elapsed(started, this.now()),
      outcome,
      context: safe,
    });
    this.outcome = worse(this.outcome, outcome);
    this.context = { ...this.context, ...safe };
  }

  private assertOpen() {
    if (this.finished) throw new Error("Processing run is already finished.");
  }
}

export async function withProcessingRun<T>(
  timings: ProcessingRun | undefined,
  kind: string,
  fn: (run: ProcessingRun) => Promise<T>,
): Promise<T> {
  const owned = !timings;
  const run = timings ?? startProcessingRun({ kind });
  try {
    const value = await fn(run);
    if (owned) pipelineTimingLog.record(run.finish());
    return value;
  } catch (error) {
    if (owned) pipelineTimingLog.record(run.finish(isPipelineTimeout(error) ? "timeout" : "failure"));
    throw error;
  }
}

export function withProcessingRunSync<T>(
  timings: ProcessingRun | undefined,
  kind: string,
  fn: (run: ProcessingRun) => T,
): T {
  const owned = !timings;
  const run = timings ?? startProcessingRun({ kind });
  try {
    const value = fn(run);
    if (owned) pipelineTimingLog.record(run.finish());
    return value;
  } catch (error) {
    if (owned) pipelineTimingLog.record(run.finish(isPipelineTimeout(error) ? "timeout" : "failure"));
    throw error;
  }
}

function resolveContext<T>(context: StageContextInput<T> | undefined, value: T): StageContext | undefined {
  return typeof context === "function" ? context(value) : context;
}

function failureContext(error: unknown): StageContext {
  if (!error || typeof error !== "object" || !("code" in error)) return {};
  return sanitizeStageContext({ failureCode: error.code });
}

function worse(current: StageOutcome, next: StageOutcome): StageOutcome {
  if (current === "timeout" || next === "timeout") return "timeout";
  if (current === "failure" || next === "failure") return "failure";
  return "success";
}

function elapsed(started: number, ended: number) {
  return Math.max(0, Math.round((ended - started) * 1000) / 1000);
}

function cloneStage(stage: StageTiming): StageTiming {
  return { ...stage, context: { ...stage.context } };
}

function cloneTiming(timing: ProcessingRunTiming): ProcessingRunTiming {
  return { ...timing, stages: timing.stages.map(cloneStage), context: { ...timing.context } };
}
