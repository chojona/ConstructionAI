"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CheckCheck, Flag, FileText, X } from "lucide-react";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttentionItemDto, FindingDto } from "@/lib/review/dto";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";

import { nextQueueIndex, reviewShortcut, type ArmedDecision } from "@/lib/review/reviewShortcuts";

const reviewerStorageKey = "construction-ai.reviewer-name";
function readStoredReviewer() {
  try { return window.localStorage.getItem(reviewerStorageKey) ?? ""; } catch { return ""; }
}
function subscribeToReviewer(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const decisions = ["ACCEPTED", "DISMISSED", "FLAGGED"] as const;

export function AttentionFeed({ projectId, items, settled = [] }: { projectId: string; items: AttentionItemDto[]; settled?: FindingDto[] }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState("");
  const storedReviewer = useSyncExternalStore(subscribeToReviewer, readStoredReviewer, () => "");
  const [reviewerDraft, setReviewerDraft] = useState<string | null>(null);
  const reviewerId = reviewerDraft ?? storedReviewer;
  const [editingReviewer, setEditingReviewer] = useState(false);
  const [settledOpen, setSettledOpen] = useState(false);
  const [armed, setArmed] = useState<ArmedDecision | null>(null);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [refreshing, startTransition] = useTransition();
  const busy = !!pendingKey || refreshing;
  const submitting = useRef(false);
  const nextSelection = useRef<{ reviewedKey: string; nextKey: string } | null>(null);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const activeItem = items.find((item) => item.finding.subjectKey === selectedKey) ?? (settled.some((finding) => finding.subjectKey === selectedKey) ? undefined : items[0]);
  const finding = activeItem?.finding ?? settled.find((finding) => finding.subjectKey === selectedKey) ?? settled[0];

  useEffect(() => {
    const next = nextSelection.current;
    if (next && settled.some((item) => item.subjectKey === next.reviewedKey)) {
      nextSelection.current = null;
      window.history.replaceState(null, "", `#${findingDomId(next.nextKey)}`);
    }
    function selectHash() {
      const match = [...items.map((item) => item.finding), ...settled].find((item) => `#${findingDomId(item.subjectKey)}` === window.location.hash);
      if (match) setSelectedKey(match.subjectKey);
    }
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, [items, settled]);

  function select(finding: FindingDto) {
    if (submitting.current || refreshing) return;
    moveFocus.current = true;
    setSelectedKey(finding.subjectKey);
    setArmed(null);
    setReason("");
    setError("");
    setStatus("");
    window.history.replaceState(null, "", `#${findingDomId(finding.subjectKey)}`);
  }

  async function review(finding: FindingDto, decision: (typeof decisions)[number]) {
    if (submitting.current || refreshing) return;
    setError("");
    if (!reviewerId.trim()) { setEditingReviewer(true); setError("Enter your name before recording a decision."); reviewerRef.current?.focus(); return; }
    if (decision !== "ACCEPTED" && !reason.trim()) { setArmed(decision); setError("Add a reason to dismiss or flag."); return; }
    submitting.current = true;
    setPendingKey(finding.subjectKey);
    try {
      const response = await fetch(`/api/projects/${projectId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-reviewer-id": reviewerId.trim() },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined, subject: finding.subject }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error?.message ?? "Could not record the review."); return; }
      setReason("");
      setArmed(null);
      const verb = decision === "ACCEPTED" ? "Accepted" : decision === "DISMISSED" ? "Dismissed" : "Flagged";
      if (decision === "FLAGGED") setStatus(`${verb} “${finding.label}”.`);
      else {
        const index = items.findIndex((item) => item.finding.subjectKey === finding.subjectKey);
        const next = items[index + 1] ?? items.find((item) => item.finding.subjectKey !== finding.subjectKey);
        const nextKey = next?.finding.subjectKey ?? finding.subjectKey;
        setStatus(next && next.finding.subjectKey !== finding.subjectKey ? `${verb} “${finding.label}”. Next item is ready.` : `${verb} “${finding.label}”.`);
        moveFocus.current = true;
        setSelectedKey(nextKey);
        nextSelection.current = { reviewedKey: finding.subjectKey, nextKey };
      }
      startTransition(() => router.refresh());
    } catch { setError("Could not record the review. Check your connection and try again."); }
    finally { submitting.current = false; setPendingKey(""); }
  }

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    headingRef.current?.focus();
  }, [selectedKey]);

  useEffect(() => {
    if (armed) reasonRef.current?.focus();
  }, [armed]);

  useEffect(() => {
    if (editingReviewer) reviewerRef.current?.focus();
  }, [editingReviewer]);

  function move(direction: -1 | 1) {
    if (busy || items.length < 2) return;
    const index = items.findIndex((item) => item.finding.subjectKey === finding?.subjectKey);
    select(items[nextQueueIndex(Math.max(index, 0), items.length, direction)]!.finding);
  }

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || busy || !activeItem) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("dialog")) return;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
    const insideDesk = target instanceof Node && Boolean(deskRef.current?.contains(target));
    if (target instanceof HTMLElement && !insideDesk && target.closest("input, textarea, button, a, select, summary")) return;
    const action = reviewShortcut(event.key, { typing, armed, reasonReady: reason.trim().length > 0 });
    if (!action) return;
    event.preventDefault();
    if (action.type === "accept") void review(activeItem.finding, "ACCEPTED");
    if (action.type === "arm") { setArmed(action.decision); setError(""); }
    if (action.type === "confirm" && armed) void review(activeItem.finding, armed);
    if (action.type === "cancel") { setArmed(null); setError(""); headingRef.current?.focus(); }
    if (action.type === "move") move(action.direction);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleShortcut(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!finding) return <div className="empty"><CheckCheck size={20} aria-hidden /><strong>Nothing needs attention</strong><span>Material changes and new items will appear here.</span></div>;

  const showReviewerField = editingReviewer || !reviewerId.trim();
  const showSettled = settledOpen || settled.some((item) => item.subjectKey === finding.subjectKey);

  const sides = [
    finding.before ? { title: sideTitle(finding, "before"), value: finding.before } : null,
    finding.after ? { title: sideTitle(finding, "after"), value: finding.after } : null,
  ].filter((side) => side !== null);

  return (
    <div ref={deskRef} className="review-workspace" aria-label="Change review">
      <nav className="change-queue" aria-label="Open items">
        <div className="queue-heading">Open <span>{items.length}</span></div>
        {!items.length && <p className="queue-empty">All decisions recorded.</p>}
        {items.map((item) => <button key={item.finding.subjectKey} className={`change-row ${finding.subjectKey === item.finding.subjectKey ? "is-selected" : ""}`} aria-current={finding.subjectKey === item.finding.subjectKey ? "true" : undefined} disabled={busy} onClick={() => select(item.finding)}><span className={`severity-dot severity-dot-${item.severity}`} /><span><strong>{reviewTitle(item.finding)}</strong><small>{comparisonLabel(item.finding)}</small><small>{item.finding.documentTitle}</small></span>{item.disposition === "reviewer_flag" && <Flag size={13} aria-label="Flagged" />}</button>)}
        {settled.length > 0 && <><button type="button" className="queue-heading settled-heading" aria-expanded={showSettled} onClick={() => setSettledOpen((open) => !open)}>Settled <span>{settled.length}</span></button>{showSettled && settled.map((item) => <button key={item.subjectKey} className={`change-row settled-row ${finding.subjectKey === item.subjectKey ? "is-selected" : ""}`} aria-current={finding.subjectKey === item.subjectKey ? "true" : undefined} disabled={busy} onClick={() => select(item)}><Check size={14} aria-hidden /><span><strong>{reviewTitle(item)}</strong><small>{settledLabel(item)}</small></span></button>)}</>}
      </nav>
      <article className="change-detail" id={findingDomId(finding.subjectKey)} aria-labelledby="finding-title" aria-busy={busy}>
        <div className="attention-kicker">{activeItem ? <SeverityBadge severity={activeItem.severity} /> : <Badge className={finding.currentDecision?.decision === "ACCEPTED" ? "status-processed" : "status-pending"}>{decisionLabel(finding.currentDecision?.decision) ?? "Recorded"}</Badge>}<span>{activeItem ? kindLabel(activeItem) : "Settled"}</span></div>
        <p className="row-meta">{finding.documentTitle} · {finding.revisionLabel}</p>
        <h3 ref={headingRef} tabIndex={-1} id="finding-title">{reviewTitle(finding)}</h3>
        <p className="finding-summary">{finding.label}</p>
        <div className={sides.length > 1 ? "compare" : "compare compare-single"}>
          {sides.map((side, index) => <div className={`comparison-side ${index === 0 && sides.length > 1 ? "comparison-before" : "comparison-after"}`} key={side.title}><h4>{side.title}</h4><p className="compare-value">{side.value.displayValue ?? side.value.summary}</p></div>)}
          {sides.length > 1 && <ArrowRight className="comparison-arrow" size={18} aria-hidden />}
        </div>
        <div className="change-explanation"><h4>Why this matters</h4><p>{activeItem?.reason ?? finding.assessment?.reason ?? "This item is already in the project review."}</p></div>
        {finding.currentDecision && <p className="decision-record">{decisionLabel(finding.currentDecision.decision)} by <strong>{finding.currentDecision.reviewerId}</strong>{finding.currentDecision.reason && ` · ${finding.currentDecision.reason}`}</p>}
        {activeItem && <form className="decision-form" onSubmit={(event) => { event.preventDefault(); void review(finding, armed ?? "ACCEPTED"); }}>
          {status && <p className="decision-status" role="status">{status}</p>}
          <div className="decision-heading"><h4>Record a decision</h4><span>Saved to project history</span></div>
          <div className="form-stack review-fields">{showReviewerField ? <label><span>Reviewer</span><Input ref={reviewerRef} value={reviewerId} onChange={(event) => {
            const value = event.target.value;
            setReviewerDraft(value);
            try { window.localStorage.setItem(reviewerStorageKey, value); } catch { /* Review remains usable when browser storage is unavailable. */ }
          }} onBlur={() => { if (reviewerId.trim()) setEditingReviewer(false); }} autoComplete="name" maxLength={120} placeholder="Alex Chen" disabled={busy} /></label> : <p className="identity-line">Reviewing as <strong>{reviewerId.trim()}</strong><button type="button" className="text-button" aria-label="Change reviewer" onClick={() => setEditingReviewer(true)}>Change</button></p>}{armed && <label><span>Reason <small>{armed === "DISMISSED" ? "Confirm dismissal with Enter" : "Confirm flag with Enter"}</small></span><Input ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Why are you setting this aside?" disabled={busy} /></label>}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="finding-actions">{decisions.map((decision) => <Button key={decision} aria-keyshortcuts={decision === "ACCEPTED" ? "A" : decision === "DISMISSED" ? "D" : "F"} type="button" size="sm" variant={decision === "ACCEPTED" ? "default" : "outline"} className={decision === "ACCEPTED" ? "accept-button" : decision === "FLAGGED" ? "flag-button" : ""} disabled={busy} onClick={() => void review(finding, decision)}>{decision === "ACCEPTED" ? <Check size={14} aria-hidden /> : decision === "DISMISSED" ? <X size={14} aria-hidden /> : <Flag size={14} aria-hidden />}{decision === "ACCEPTED" ? "Accept" : decision === "DISMISSED" ? "Dismiss" : "Flag"}</Button>)}{busy && <span role="status" className="row-meta">Saving decision…</span>}</div>
          <div className="review-navigation"><span>A accept · D dismiss · F flag</span><div><Button type="button" variant="ghost" size="sm" disabled={busy || items.length < 2} aria-keyshortcuts="ArrowUp" onClick={() => move(-1)}>Previous</Button><Button type="button" variant="ghost" size="sm" disabled={busy || items.length < 2} aria-keyshortcuts="ArrowDown" onClick={() => move(1)}>Next</Button></div></div>
        </form>}
      </article>
      <aside className="evidence-panel" aria-label="Source evidence"><div className="context-heading"><FileText size={15} aria-hidden /><h4>Source evidence</h4></div><p className="context-help">Exact excerpts from the uploaded revisions. Open a quote to verify its location.</p>
        {sides.map((side) => <section className="evidence-section" key={side.title}><h5>{side.title}</h5>{side.value.evidence.length ? <EvidenceQuotes items={side.value.evidence} returnTo={decisionReturnPath(projectId, finding.subjectKey)} /> : <p className="row-meta">No linked excerpt available.</p>}</section>)}
        <div className="source-links">{finding.sources.map((source) => <Link key={source.revisionId} href={`/revisions/${source.revisionId}`}><FileText size={14} aria-hidden />{source.revisionLabel}</Link>)}</div>
      </aside>
    </div>
  );
}

function sideTitle(finding: FindingDto, side: "before" | "after") {
  if (finding.before && finding.after) return side === "before" ? "Previous" : "Current";
  if (finding.subject.type === "revision_change" && finding.subject.changeType === "REMOVED") return "Removed";
  if (finding.subject.type === "revision_change" && finding.subject.changeType === "ADDED") return "Added";
  return "Extracted";
}

function kindLabel(item: AttentionItemDto) {
  if (item.disposition === "proven_conflict") return "Conflicts with a record";
  if (item.disposition === "material_change") return "Material change";
  if (item.disposition === "change_detected") return "Wording only";
  if (item.disposition === "reviewer_flag") return "Flagged";
  return "Not yet reviewed";
}

function decisionLabel(decision: string | undefined) {
  if (decision === "ACCEPTED") return "Accepted";
  if (decision === "DISMISSED") return "Dismissed";
  if (decision === "FLAGGED") return "Flagged";
  return "Recorded";
}

function settledLabel(finding: FindingDto) {
  if (!finding.currentDecision) return "No decision required";
  return decisionLabel(finding.currentDecision.decision);
}

function reviewTitle(finding: FindingDto) {
  const category = (finding.after ?? finding.before)?.category;
  const label = category === "equipment_requirement" ? "Equipment requirement" : category === "schedule_date" ? "Schedule date" : category === "quantity" ? "Quantity" : "Item";
  if (finding.subject.type === "proposed_fact") return `${label} to review`;
  return `${label} ${finding.subject.changeType === "ADDED" ? "added" : finding.subject.changeType === "REMOVED" ? "removed" : "changed"}`;
}

function comparisonLabel(finding: FindingDto) {
  const before = finding.before?.displayValue;
  const after = finding.after?.displayValue;
  return before && after ? `${before} → ${after}` : before ?? after ?? finding.revisionLabel;
}
