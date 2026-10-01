"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { ScrollToFinding } from "@/components/review/scroll-to-finding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttentionItemDto, FindingDto } from "@/lib/review/dto";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";

const decisions = ["ACCEPTED", "DISMISSED", "FLAGGED"] as const;

export function AttentionFeed({ projectId, items }: { projectId: string; items: AttentionItemDto[] }) {
  const router = useRouter();
  const [reviewerId, setReviewerId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");

  async function review(finding: FindingDto, decision: (typeof decisions)[number]) {
    setError("");
    if (!reviewerId.trim()) {
      setError("Enter a reviewer id before recording a decision.");
      return;
    }
    if (decision !== "ACCEPTED" && !reason.trim()) {
      setError("Dismissing or flagging a finding requires a reason.");
      return;
    }
    setPendingKey(finding.subjectKey);
    const response = await fetch(`/api/projects/${projectId}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-reviewer-id": reviewerId.trim() },
      body: JSON.stringify({
        decision,
        reason: reason.trim() || undefined,
        subject: finding.subject,
      }),
    });
    const result = await response.json();
    setPendingKey("");
    if (!response.ok) {
      setError(result.error?.message ?? "Could not record the review.");
      return;
    }
    router.refresh();
  }

  if (!items.length) {
    return <div className="empty">No open exceptions. Material changes and unreviewed facts will appear here.</div>;
  }

  return (
    <div>
      <div className="form-stack review-fields">
        <label><span>Reviewer</span><Input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} maxLength={120} placeholder="pm-1" /></label>
        <label><span>Reason</span><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Required to dismiss or flag" /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ScrollToFinding />
      <div className="attention">
        {items.map((item) => (
          <article className="attention-item" id={findingDomId(item.finding.subjectKey)} key={item.finding.subjectKey}>
            <div className="attention-kicker">
              <Badge className={severityClass(item.severity)}>{item.severity}</Badge>
              <span>{kindLabel(item)}</span>
            </div>
            <p className="row-meta">{item.finding.documentTitle}</p>
            <h3>{item.finding.label}</h3>
            <p className="attention-reason"><span className="evidence-kicker">Explanation</span>{item.reason}</p>
            <p className="source-line">{sourceLine(item.finding)}</p>
            <Comparison finding={item.finding} projectId={projectId} />
            <div className="finding-actions">
              {decisions.map((decision) => (
                <Button
                  key={decision}
                  type="button"
                  size="sm"
                  variant={decision === "ACCEPTED" ? "default" : decision === "DISMISSED" ? "outline" : "ghost"}
                  disabled={pendingKey === item.finding.subjectKey}
                  onClick={() => review(item.finding, decision)}
                >
                  {decision === "ACCEPTED" ? "Accept" : decision === "DISMISSED" ? "Dismiss" : "Flag"}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Comparison({ finding, projectId }: { finding: FindingDto; projectId: string }) {
  const sides = [
    finding.before ? { title: sideTitle(finding, "before"), value: finding.before } : null,
    finding.after ? { title: sideTitle(finding, "after"), value: finding.after } : null,
  ].filter((side) => side !== null);
  if (!sides.length) return null;
  return (
    <div className={sides.length > 1 ? "compare" : "compare compare-single"}>
      {sides.map((side) => (
        <div key={side.title}>
          <h4>{side.title}</h4>
          <p className="evidence-kicker">Reading</p>
          <p className="compare-value">{side.value.summary}</p>
          <EvidenceQuotes items={side.value.evidence} returnTo={decisionReturnPath(projectId, finding.subjectKey)} />
        </div>
      ))}
    </div>
  );
}

function sideTitle(finding: FindingDto, side: "before" | "after") {
  if (finding.before && finding.after) return side === "before" ? "Previous" : "Current";
  if (finding.subject.type === "revision_change" && finding.subject.changeType === "REMOVED") return "Removed";
  if (finding.subject.type === "revision_change" && finding.subject.changeType === "ADDED") return "Added";
  return "Extracted";
}

function sourceLine(finding: FindingDto) {
  return finding.sources.map((source, index) => (
    <span key={source.revisionId}>
      {index > 0 && <span className="source-joiner"> to </span>}
      <Link href={`/revisions/${source.revisionId}`}>{source.role === "previous" ? "Previous" : source.role === "current" ? "Current" : "Source"} {source.revisionLabel}</Link>
    </span>
  ));
}

function kindLabel(item: AttentionItemDto) {
  if (item.disposition === "proven_conflict") return "Proven conflict";
  if (item.disposition === "material_change") return "Material change";
  if (item.disposition === "change_detected") return "Change detected";
  if (item.disposition === "reviewer_flag") return "Flagged";
  return "Unreviewed fact";
}

function severityClass(severity: AttentionItemDto["severity"]) {
  if (severity === "critical") return "severity-critical";
  if (severity === "high") return "severity-high";
  if (severity === "low") return "severity-low";
  return "severity-medium";
}
