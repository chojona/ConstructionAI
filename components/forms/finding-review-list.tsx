"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FindingDto } from "@/lib/review/dto";

const decisions = ["ACCEPTED", "DISMISSED", "FLAGGED"] as const;

export function FindingReviewList({ projectId, findings }: { projectId: string; findings: FindingDto[] }) {
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

  if (!findings.length) return <div className="empty">No proposed findings yet.</div>;

  return (
    <div>
      <div className="form-stack review-fields">
        <label><span>Reviewer</span><Input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} maxLength={120} placeholder="pm-1" /></label>
        <label><span>Reason</span><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Required to dismiss or flag" /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {findings.map((finding) => (
        <article className="finding" key={finding.subjectKey}>
          <p className="row-meta">{finding.documentTitle} · {finding.revisionLabel}</p>
          <h3>{finding.label}</h3>
          <p>{finding.detail}{finding.currentDecision ? ` · ${finding.currentDecision.decision.toLowerCase()} by ${finding.currentDecision.reviewerId}` : ""}</p>
          {finding.evidence.map((item) => (
            <p className="evidence-note" key={`${item.pageNumber}-${item.excerpt}`}>Page {item.pageNumber}: “{item.excerpt}”</p>
          ))}
          <div className="finding-actions">
            {decisions.map((decision) => (
              <Button
                key={decision}
                type="button"
                size="sm"
                variant={decision === "ACCEPTED" ? "default" : decision === "DISMISSED" ? "outline" : "ghost"}
                disabled={pendingKey === finding.subjectKey}
                onClick={() => review(finding, decision)}
              >
                {decision === "ACCEPTED" ? "Accept" : decision === "DISMISSED" ? "Dismiss" : "Flag"}
              </Button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
