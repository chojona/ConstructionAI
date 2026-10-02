import type { ExtractionRunStatus, RevisionStatus } from "@/lib/domain/types";
import type { EvidenceLocation } from "@/lib/review/evidenceLocation";

export type ExperienceTone = "ready" | "waiting" | "failed" | "idle";

export interface ExperienceCopy {
  label: string;
  tone: ExperienceTone;
  summary: string;
  action: string | null;
}

export function describeReading(
  status: RevisionStatus,
  failureCode: string | null,
  failureMessage: string | null,
): ExperienceCopy {
  if (status === "FAILED") {
    if (failureCode === "SCANNED_OR_EMPTY") {
      return {
        label: "Needs a new file",
        tone: "failed",
        summary: "This PDF has no selectable text, so nothing could be read from it.",
        action: "Upload a PDF that was exported with text, not a scan.",
      };
    }
    if (failureCode === "MALFORMED_PDF") {
      return {
        label: "Needs a new file",
        tone: "failed",
        summary: "This file could not be read as a PDF.",
        action: "Check the file and upload it again.",
      };
    }
    return {
      label: "Needs a new file",
      tone: "failed",
      summary: failureMessage?.trim() || "This revision could not be read.",
      action: "Upload a replacement PDF.",
    };
  }
  if (status === "PROCESSED") {
    return {
      label: "Ready",
      tone: "ready",
      summary: "The PDF was read and its pages are available.",
      action: null,
    };
  }
  if (status === "PROCESSING") {
    return {
      label: "Reading",
      tone: "waiting",
      summary: "The PDF is being read. Pages will show up when that finishes.",
      action: null,
    };
  }
  return {
    label: "Uploaded",
    tone: "waiting",
    summary: "The file is saved and waiting to be read.",
    action: null,
  };
}

export function describeAnalysis(
  runs: readonly { attemptNumber: number; status: ExtractionRunStatus; failureMessage: string | null }[],
  listedCount?: number,
): ExperienceCopy {
  const latest = [...runs].sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
  if (!latest) {
    return {
      label: "Not analyzed",
      tone: "idle",
      summary: "No analysis has been run for this revision.",
      action: null,
    };
  }
  if (latest.status === "SUCCEEDED") {
    if (listedCount === 0) {
      return {
        label: "No extracts",
        tone: "idle",
        summary: "",
        action: null,
      };
    }
    return {
      label: "Analyzed",
      tone: "ready",
      summary: "Analysis finished for this revision.",
      action: null,
    };
  }
  if (latest.status === "FAILED") {
    return {
      label: "Analysis failed",
      tone: "failed",
      summary: "Analysis did not finish for this revision.",
      action: null,
    };
  }
  if (latest.status === "RUNNING") {
    return {
      label: "Analyzing",
      tone: "waiting",
      summary: "Analysis is in progress.",
      action: null,
    };
  }
  if (latest.status === "QUEUED") {
    return {
      label: "Queued",
      tone: "waiting",
      summary: "Analysis is queued and has not started.",
      action: null,
    };
  }
  return {
    label: "Not analyzed",
    tone: "idle",
    summary: "The latest analysis was replaced and has no result yet.",
    action: null,
  };
}

export interface RevisionFindingView {
  label: string;
  material: boolean | null;
  evidence: EvidenceLocation[];
  sources: readonly { revisionId: string }[];
  subject:
    | { type: "proposed_fact" }
    | { type: "revision_change"; changeType: "ADDED" | "REMOVED" | "MODIFIED"; revisedRevisionId: string };
}

export interface RevisionSignals<T extends RevisionFindingView = RevisionFindingView> {
  changeCount: number;
  materialCount: number;
  changes: T[];
  extracted: T[];
}

export function revisionSignals<T extends RevisionFindingView>(revisionId: string, findings: readonly T[]): RevisionSignals<T> {
  const changes = findings.filter((finding) => (
    finding.subject.type === "revision_change" && finding.subject.revisedRevisionId === revisionId
  ));
  const extracted = findings.filter((finding) => (
    finding.subject.type === "proposed_fact" && finding.sources.some((source) => source.revisionId === revisionId)
  ));
  return {
    changeCount: changes.length,
    materialCount: changes.filter((finding) => finding.material === true).length,
    changes,
    extracted,
  };
}

export function changeSummary(signals: Pick<RevisionSignals, "changeCount" | "materialCount" | "extracted">): string | null {
  if (signals.changeCount > 0) {
    const changes = `${signals.changeCount} ${signals.changeCount === 1 ? "change" : "changes"}`;
    if (signals.materialCount === 0) return changes;
    const material = `${signals.materialCount} material`;
    return `${changes}, ${material}`;
  }
  if (signals.extracted.length > 0) {
    const count = signals.extracted.length;
    return `${count} extracted ${count === 1 ? "item" : "items"}`;
  }
  return null;
}

export function emptyExtractCopy(readingTone: ExperienceTone): string {
  if (readingTone === "ready") return "No proposed facts from this revision yet.";
  if (readingTone === "waiting") return "Proposed facts show up after this revision is read.";
  return "No proposed facts from this revision.";
}

export function changeKind(finding: RevisionFindingView): string {
  if (finding.subject.type !== "revision_change") return "Extracted item";
  const kind = { ADDED: "Added", REMOVED: "Removed", MODIFIED: "Changed" }[finding.subject.changeType];
  return finding.material ? `Material · ${kind}` : `Wording only · ${kind}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}
