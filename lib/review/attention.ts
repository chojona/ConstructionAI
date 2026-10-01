import { type ProcessingRun, withProcessingRunSync } from "@/lib/observability/pipelineTiming";
import type { ProjectFinding } from "./findings";

export type AttentionSeverity = "high" | "medium";

export interface AttentionItem {
  finding: ProjectFinding;
  severity: AttentionSeverity;
  reason: string;
}

const severityRank: Record<AttentionSeverity, number> = { high: 0, medium: 1 };

const basisReason: Record<NonNullable<ProjectFinding["basis"]>, string> = {
  identity: "The requirement no longer matches the earlier revision.",
  numeric: "The amount changed.",
  unit: "The unit changed.",
  date: "The date changed.",
  modality: "The certainty of the statement changed.",
  wording: "Only the wording changed.",
};

export function listAttention(findings: readonly ProjectFinding[], timings?: ProcessingRun): AttentionItem[] {
  return withProcessingRunSync(timings, "review_attention", (run) => run.measure(
    "review_attention",
    () => selectAttention(findings),
    (items) => ({ findingCount: findings.length, attentionCount: items.length }),
  ));
}

function selectAttention(findings: readonly ProjectFinding[]): AttentionItem[] {
  return findings.flatMap((finding) => {
    const item = toAttention(finding);
    return item ? [item] : [];
  }).sort((left, right) => (
    severityRank[left.severity] - severityRank[right.severity]
    || left.finding.documentTitle.localeCompare(right.finding.documentTitle)
    || left.finding.revisionLabel.localeCompare(right.finding.revisionLabel)
    || left.finding.label.localeCompare(right.finding.label)
    || left.finding.subjectKey.localeCompare(right.finding.subjectKey)
  ));
}

export function listSettled(findings: readonly ProjectFinding[]): ProjectFinding[] {
  const open = new Set(selectAttention(findings).map((item) => item.finding.subjectKey));
  return findings.filter((finding) => !open.has(finding.subjectKey));
}

function toAttention(finding: ProjectFinding): AttentionItem | null {
  const decision = finding.currentDecision?.decision;
  if (decision === "ACCEPTED" || decision === "DISMISSED") return null;
  if (decision === "FLAGGED") {
    return {
      finding,
      severity: "high",
      reason: finding.currentDecision?.reason?.trim() || "Flagged for follow-up.",
    };
  }
  if (finding.subject.type === "revision_change" && finding.material === false) return null;
  if (finding.subject.type === "revision_change") {
    return {
      finding,
      severity: finding.subject.changeType === "ADDED" ? "medium" : "high",
      reason: changeReason(finding),
    };
  }
  return {
    finding,
    severity: "medium",
    reason: "Extracted from the source revision and not yet reviewed.",
  };
}

function changeReason(finding: ProjectFinding) {
  const changeType = finding.subject.type === "revision_change" ? finding.subject.changeType : "MODIFIED";
  const because = finding.basis ? basisReason[finding.basis] : "The later revision differs.";
  if (changeType === "REMOVED") return `Removed in the later revision. ${because}`;
  if (changeType === "ADDED") return `Added in the later revision. ${because}`;
  return `Material change between revisions. ${because}`;
}
