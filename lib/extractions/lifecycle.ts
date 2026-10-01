import type { ExtractionRunStatus } from "@/lib/domain/types";

export const EXTRACTION_RUN_TRANSITIONS: Record<ExtractionRunStatus, readonly ExtractionRunStatus[]> = {
  QUEUED: ["RUNNING", "FAILED"],
  RUNNING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["SUPERSEDED"],
  FAILED: [],
  SUPERSEDED: [],
};

export function canAdvanceExtractionRun(from: ExtractionRunStatus, to: ExtractionRunStatus): boolean {
  return EXTRACTION_RUN_TRANSITIONS[from].includes(to);
}
