"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ApprovalSignoffText } from "@/components/review/approval-signoff";
import { DecisionChangeList, DecisionEvidence } from "@/components/review/decision-change-list";
import type { ApprovalSignoff } from "@/lib/auth/approvalSignoff";
import { FactBadges } from "@/components/review/fact-badges";
import { PagePreview } from "@/components/review/page-preview";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { EmptyChanges } from "@/components/review/changes-empty";
import { ExportPacketControl } from "@/components/review/export-packet";
import { LegacyPageCiteNotice } from "@/components/review/pack-proof";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttentionItemDto, FindingDto } from "@/lib/review/dto";
import { changeEvidenceLead, changePageChip, changeRowTitle, type DecidedRowChrome } from "@/lib/review/changeRow";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";
import { appendixFactBinding, DESK_EMPTY_MISSING_EVIDENCE, DESK_EMPTY_NO_SELECTION, type ApprovedChangePreview, type DeskPackFile } from "@/lib/review/exportPacketView";
import { queueBadges, showAiSuggested } from "@/lib/review/factBadge";
import { defaultDeskKey } from "@/lib/review/factList";
import {
  ACCEPTED_TODAY_LABEL,
  NEEDS_REVIEW_LABEL,
  REJECTED_TODAY_LABEL,
  REVIEW_BOUNDARY_NOTE,
  REVIEW_BOUNDARY_TITLE,
  WHY_REVIEW_TITLE,
} from "@/lib/review/reviewDeskCopy";
import type { ReviewSummaryCounts } from "@/lib/review/reviewSummary";
import { pinnedSourceCitation } from "@/lib/review/sourceCitation";

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
  decided = [],
  notes = [],
  chapters = [],
  appendices = [],
  citeNotice = null,
  summary,
  signoffs = [],
}: {
  projectId: string;
  items: AttentionItemDto[];
  uploadHref: string;
  approved?: readonly ApprovedChangePreview[];
  decided?: readonly DecidedRowChrome[];
  notes?: readonly { key: string; before: string; name: string; disabled: boolean; after: string }[];
  chapters?: readonly DeskPackFile[];
  appendices?: readonly DeskPackFile[];
  citeNotice?: string | null;
  summary?: ReviewSummaryCounts;
  signoffs?: readonly (ApprovalSignoff & { subjectKey: string })[];
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
  const findingKeys = items.map((item) => {
    const page = changeEvidenceLead(item.finding)?.page;
    return { key: item.finding.subjectKey, pageNumber: page && page > 0 ? page : null };
  });
  const openCitedKey = findingKeys.find((row) => row.pageNumber)?.key ?? "";
  const fallbackKey = openCitedKey || defaultDeskKey(decided, findingKeys);
  const selectedIsKnown = decided.some((row) => row.key === selectedKey) || items.some((item) => item.finding.subjectKey === selectedKey);
  const activeKey = selectedIsKnown ? selectedKey : fallbackKey;
  const selectedItem = items.find((item) => item.finding.subjectKey === activeKey) ?? null;
  const selected = selectedItem?.finding;
  const selectedDecided = decided.find((row) => row.key === activeKey) ?? null;
  const appendixFact = appendixFactBinding(approved, selectedDecided);

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

  function openDecided(row: DecidedRowChrome) {
    setSelectedKey(row.key);
    setRejecting(false);
    setReason("");
    setError("");
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
  const sourceCitation = selected && evidenceLead ? pinnedSourceCitation({
    documentTitle: evidenceLead.documentTitle || selected.documentTitle,
    revisionLabel: evidenceLead.revisionLabel,
    revisionId: evidenceLead.revisionId,
    pageNumber: evidenceLead.page,
  }) : null;
  const counts = summary ?? { needsReview: items.length, acceptedToday: 0, rejectedToday: 0 };
  const reviewReason = selectedItem?.reason.trim() ?? "";

  return (
    <div className="change-desk">
      <div className="change-list-pane">
        <section className="review-summary" aria-label="Review summary">
          <div className="review-summary-stat"><strong>{counts.needsReview}</strong><span>{NEEDS_REVIEW_LABEL}</span></div>
          <div className="review-summary-stat"><strong>{counts.acceptedToday}</strong><span>{ACCEPTED_TODAY_LABEL}</span></div>
          <div className="review-summary-stat"><strong>{counts.rejectedToday}</strong><span>{REJECTED_TODAY_LABEL}</span></div>
        </section>
        <LegacyPageCiteNotice message={citeNotice} />
        <ExportPacketControl projectId={projectId} changes={approved} actorId={reviewerId} openCount={items.length} chapters={chapters} appendices={appendices} appendixSubjectKey={appendixFact.subjectKey} appendixPageCites={appendixFact.pageCites} signoffs={signoffs} />
        {(decided.length > 0 || notes.length > 0) && (
          <>
            {decided.length > 0 && (
              <>
                <p className="packet-kicker">Facts <span className="count">{decided.length}</span></p>
                <DecisionChangeList rows={decided} activeKey={activeKey} onSelect={openDecided} />
              </>
            )}
            {notes.length > 0 && <div className="retired">{notes.map((note) => <p key={note.key}>{note.before}<ApprovalSignoffText name={note.name} disabled={note.disabled} />{note.after}</p>)}</div>}
          </>
        )}
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
                    <FactBadges badges={queueBadges(finding)} suggested={showAiSuggested(finding.currentDecision)} />
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
                  {sourceCitation ? <p className="source-citation">{sourceCitation}</p> : null}
                  {reviewReason ? (
                    <section className="why-review">
                      <h4>{WHY_REVIEW_TITLE}</h4>
                      <p>{reviewReason}</p>
                    </section>
                  ) : null}
                  {evidenceLead.page > 0 && (
                    <PagePreview projectId={projectId} revisionId={evidenceLead.revisionId} pageNumber={evidenceLead.page} />
                  )}
                </div>
              )}
              {sourceCitation ? null : <p className="row-meta">{selected.documentTitle} · {selected.revisionLabel}</p>}
              <FactBadges badges={queueBadges(selected)} suggested={showAiSuggested(selected.currentDecision)} />
              <h3 id="finding-title" tabIndex={-1}>{changeRowTitle(selected)}</h3>
              <p className="finding-summary">{selected.label}</p>
              {!evidenceLead && reviewReason ? (
                <section className="why-review">
                  <h4>{WHY_REVIEW_TITLE}</h4>
                  <p>{reviewReason}</p>
                </section>
              ) : null}
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
                    : <p className="rail-empty rail-empty-inline">{DESK_EMPTY_MISSING_EVIDENCE}</p>}
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
        ) : selectedDecided ? <DecisionEvidence row={selectedDecided} projectId={projectId} /> : <p className="rail-empty">{DESK_EMPTY_NO_SELECTION}</p>}
        <footer className="review-boundary">
          <strong>{REVIEW_BOUNDARY_TITLE}</strong>
          <p>{REVIEW_BOUNDARY_NOTE}</p>
        </footer>
      </aside>
    </div>
  );
}
