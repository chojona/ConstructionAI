import { type ProcessingRun, withProcessingRunSync } from "@/lib/observability/pipelineTiming";
import type { ProjectFinding } from "./findings";
import type { SeverityDisposition, SeverityLevel } from "./severity";

export type AttentionSeverity = SeverityLevel;
export type AttentionDisposition = SeverityDisposition | "reviewer_flag" | "unreviewed_extraction";

export interface AttentionItem {
  finding: ProjectFinding;
  severity: AttentionSeverity;
  disposition: AttentionDisposition;
  rule: string;
  reason: string;
}

const severityRank: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

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
      disposition: "reviewer_flag",
      rule: "reviewer.flag",
      reason: finding.currentDecision?.reason?.trim() || "Flagged for follow-up.",
    };
  }
  if (finding.subject.type === "revision_change") {
    const assessment = finding.assessment;
    if (!assessment || assessment.disposition === "change_detected" || assessment.severity === "low") return null;
    return {
      finding,
      severity: assessment.severity,
      disposition: assessment.disposition,
      rule: assessment.rule,
      reason: assessment.reason,
    };
  }
  return {
    finding,
    severity: "medium",
    disposition: "unreviewed_extraction",
    rule: "extraction.unreviewed",
    reason: "Extracted from the source revision and not yet reviewed.",
  };
}
