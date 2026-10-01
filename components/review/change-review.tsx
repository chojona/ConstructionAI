"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { EmptyChanges } from "@/components/review/changes-empty";
import { ExportPacketControl } from "@/components/review/export-packet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttentionItemDto, FindingDto } from "@/lib/review/dto";
import type { ApprovedChangePreview } from "@/lib/review/exportPacketView";
import { changeEvidenceLead, changePageChip, changeRowTitle } from "@/lib/review/changeRow";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";

const reviewerStorageKey = "construction-ai.reviewer-name";

function readStoredReviewer() {
  try { return window.localStorage.getItem(reviewerStorageKey) ?? ""; } catch { return ""; }
}

function subscribeToReviewer(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function ChangeReview({
  projectId,
  items,
  uploadHref,
  approved = [],
}: {
  projectId: string;
  items: AttentionItemDto[];
  uploadHref: string;
  approved?: readonly ApprovedChangePreview[];
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState("");
  const [reviewerDraft, setReviewerDraft] = useState<string | null>(null);
  const storedReviewer = useSyncExternalStore(subscribeToReviewer, readStoredReviewer, () => "");
  const reviewerId = reviewerDraft ?? storedReviewer;
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const selected = items.find((item) => item.finding.subjectKey === selectedKey)?.finding;

  useEffect(() => {
    function selectHash() {
      const match = items.find((item) => `#${findingDomId(item.finding.subjectKey)}` === window.location.hash);
      if (match) setSelectedKey(match.finding.subjectKey);
    }
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, [items]);

  function openReview(finding: FindingDto) {
    setSelectedKey(finding.subjectKey);
    setRejecting(false);
    setReason("");
    setError("");
    window.history.replaceState(null, "", `#${findingDomId(finding.subjectKey)}`);
  }

  async function decide(finding: FindingDto, decision: "ACCEPTED" | "DISMISSED") {
    setError("");
    if (!reviewerId.trim()) {
      setError("Enter your name before recording a decision.");
      return;
    }
    if (decision === "DISMISSED" && !reason.trim()) {
      setRejecting(true);
      setError("Add a reason to reject.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-reviewer-id": reviewerId.trim() },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined, subject: finding.subject }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Could not record the review.");
        return;
      }
      setReason("");
      setRejecting(false);
      setSelectedKey("");
      router.refresh();
    } catch {
      setError("Could not record the review. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const sides = selected ? [
    selected.before ? { title: "Previous", value: selected.before, tone: "comparison-before" } : null,
    selected.after ? { title: "Current", value: selected.after, tone: "comparison-after" } : null,
  ].filter((side) => side !== null) : [];
  const evidenceLead = selected ? changeEvidenceLead(selected) : null;

  return (
    <div className="change-desk">
      <div className="change-list-pane">
        <ExportPacketControl projectId={projectId} changes={approved} />
        {items.length === 0 ? <EmptyChanges href={uploadHref} /> : (
          <ul className="change-list">
            {items.map((item) => {
              const finding = item.finding;
              const active = finding.subjectKey === selected?.subjectKey;
              return (
                <li key={finding.subjectKey} id={findingDomId(finding.subjectKey)} className={`change-card${active ? " is-active" : ""}`}>
                  <div className="change-card-copy">
                    <p className="row-title">{changeRowTitle(finding)}</p>
                    <p className="row-meta">{finding.documentTitle}</p>
                  </div>
                  <span className="page-chip">{changePageChip(finding)}</span>
                  <Button type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} onClick={() => openReview(finding)}>Review</Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <aside className="evidence-rail evidence-panel" aria-label="Source evidence">
        {selected ? (
          <>
            <div className="evidence-rail-body">
              {evidenceLead && (
                <div className="evidence-rail-lead">
                  <span className="page-chip">{changePageChip(selected)}</span>
                  <p className="evidence-rail-excerpt">{evidenceLead.excerpt}</p>
                </div>
              )}
              <p className="row-meta">{selected.documentTitle} · {selected.revisionLabel}</p>
              <h3 id="finding-title" tabIndex={-1}>{changeRowTitle(selected)}</h3>
              <p className="finding-summary">{selected.label}</p>
              {sides.length > 0 && (
                <div className={sides.length > 1 ? "compare" : "compare compare-single"}>
                  {sides.map((side) => (
                    <div className={`comparison-side ${side.tone}`} key={side.title}>
                      <h4>{side.title}</h4>
                      <p className="compare-value">{side.value.displayValue ?? side.value.summary}</p>
                    </div>
                  ))}
                </div>
              )}
              {sides.map((side) => (
                <section className="evidence-section" key={side.title}>
                  <h5>{side.title}</h5>
                  {side.value.evidence.length
                    ? <EvidenceQuotes items={side.value.evidence} returnTo={decisionReturnPath(projectId, selected.subjectKey)} />
                    : <p className="row-meta">No linked excerpt available.</p>}
                </section>
              ))}
            </div>
            <form className="decision-sticky" onSubmit={(event) => { event.preventDefault(); void decide(selected, rejecting ? "DISMISSED" : "ACCEPTED"); }}>
              {error && <p className="form-error" role="alert">{error}</p>}
              <label className="sticky-reviewer"><span>Reviewer</span><Input value={reviewerId} onChange={(event) => {
                const value = event.target.value;
                setReviewerDraft(value);
                try { window.localStorage.setItem(reviewerStorageKey, value); } catch { /* Review stays usable when storage is blocked. */ }
              }} autoComplete="name" maxLength={120} placeholder="Alex Chen" disabled={pending} /></label>
              {rejecting && <label className="sticky-reviewer"><span>Reason</span><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Why are you rejecting this?" disabled={pending} /></label>}
              <div className="sticky-actions">
                <Button type="button" className="accept-button" disabled={pending} onClick={() => void decide(selected, "ACCEPTED")}>Approve</Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => void decide(selected, "DISMISSED")}>Reject</Button>
                {pending && <span role="status">Saving…</span>}
              </div>
            </form>
          </>
        ) : <p className="rail-empty">Evidence opens here.</p>}
      </aside>
    </div>
  );
}
