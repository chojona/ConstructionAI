"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttentionItemDto, FindingDto } from "@/lib/review/dto";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";
import { nextQueueIndex, reviewShortcut, type ArmedDecision } from "@/lib/review/reviewShortcuts";

type Decision = "ACCEPTED" | "DISMISSED" | "FLAGGED";
const reviewerStorageKey = "construction-ai.reviewer-name";

function subscribeToReviewer() {
  return () => {};
}

function readStoredReviewer() {
  return window.localStorage.getItem(reviewerStorageKey) ?? "";
}

export function AttentionFeed({ projectId, items }: { projectId: string; items: AttentionItemDto[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState(items);
  const [index, setIndex] = useState(0);
  const storedReviewer = useSyncExternalStore(subscribeToReviewer, readStoredReviewer, () => "");
  const [reviewerDraft, setReviewerDraft] = useState<string | null>(null);
  const reviewerId = reviewerDraft ?? storedReviewer;
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState<ArmedDecision | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const decided = useRef(new Set<string>());
  const moveFocus = useRef(false);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const hashApplied = useRef(false);

  useEffect(() => {
    for (const key of decided.current) {
      if (!items.some((item) => item.finding.subjectKey === key)) decided.current.delete(key);
    }
    const open = items.filter((item) => !decided.current.has(item.finding.subjectKey));
    setQueue(open);
    setIndex((current) => {
      if (!hashApplied.current) {
        hashApplied.current = true;
        const hashed = open.findIndex((item) => findingDomId(item.finding.subjectKey) === window.location.hash.slice(1));
        if (hashed >= 0) return hashed;
      }
      return Math.min(current, Math.max(open.length - 1, 0));
    });
  }, [items]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    headingRef.current?.focus();
  }, [index, queue]);

  const current = queue[index] ?? null;

  const move = useCallback((direction: -1 | 1) => {
    if (queue.length < 2) return;
    moveFocus.current = true;
    setArmed(null);
    setError("");
    setIndex(nextQueueIndex(index, queue.length, direction));
  }, [index, queue.length]);

  function selectIndex(next: number) {
    moveFocus.current = true;
    setArmed(null);
    setError("");
    setIndex(next);
  }

  const arm = useCallback((decision: ArmedDecision) => {
    setError("");
    setArmed(decision);
    requestAnimationFrame(() => reasonRef.current?.focus());
  }, []);

  const review = useCallback(async (finding: FindingDto | undefined, decision: Decision) => {
    if (!finding || pendingKey) return;
    setError("");
    if (!reviewerId.trim()) {
      setError("Enter your name before recording a decision.");
      reviewerRef.current?.focus();
      return;
    }
    if (decision !== "ACCEPTED" && !reason.trim()) {
      arm(decision);
      setError(decision === "DISMISSED" ? "Add a reason to dismiss this item." : "Add a reason to flag this item.");
      return;
    }
    const key = finding.subjectKey;
    const previousQueue = queue;
    const previousIndex = index;
    setPendingKey(key);
    const response = await fetch(`/api/projects/${projectId}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-reviewer-id": reviewerId.trim() },
      body: JSON.stringify({
        decision,
        reason: reason.trim() || undefined,
        subject: finding.subject,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setPendingKey("");
      setError(result?.error?.message ?? "Could not record the decision.");
      return;
    }
    decided.current.add(key);
    const remaining = previousQueue.filter((item) => item.finding.subjectKey !== key);
    setQueue(remaining);
    setIndex(Math.min(previousIndex, Math.max(remaining.length - 1, 0)));
    setReason("");
    setArmed(null);
    setPendingKey("");
    moveFocus.current = remaining.length > 0;
    setStatus(`${decisionLabel(decision)} “${finding.label}”. ${remaining.length === 0 ? "Nothing else needs a decision." : `${remaining.length} still open.`}`);
    router.refresh();
  }, [arm, index, pendingKey, projectId, queue, reason, reviewerId, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
      const insideDesk = target instanceof Node && Boolean(deskRef.current?.contains(target));
      const outsideControl = target instanceof HTMLElement && !insideDesk && Boolean(target.closest("input, textarea, button, a, select, summary"));
      if (outsideControl) return;
      const action = reviewShortcut(event.key, { typing, armed, reasonReady: reason.trim().length > 0 });
      if (!action) return;
      event.preventDefault();
      if (action.type === "accept") void review(queue[index]?.finding, "ACCEPTED");
      if (action.type === "arm") arm(action.decision);
      if (action.type === "confirm" && armed) void review(queue[index]?.finding, armed);
      if (action.type === "cancel") {
        setArmed(null);
        setError("");
        headingRef.current?.focus();
      }
      if (action.type === "move") move(action.direction);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [arm, armed, index, move, queue, reason, review]);

  return (
    <div className="review-desk-wrap" ref={deskRef}>
      <div className="review-toolbar">
        <label className="reviewer-field">
          <span>Your name</span>
          <Input
            ref={reviewerRef}
            value={reviewerId}
            onChange={(event) => {
              const value = event.target.value;
              setReviewerDraft(value);
              window.localStorage.setItem(reviewerStorageKey, value);
            }}
            maxLength={120}
            placeholder="Alex Chen"
            autoComplete="name"
          />
        </label>
        <p className="review-keys">A accept, D dismiss, F flag. Arrow keys move between open items.</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="review-status" role="status">{status}</p>
      {!current ? (
        <div className="empty">Nothing needs a decision. Wording-only edits stay out of this queue.</div>
      ) : (
        <div className="review-desk">
          <article
            className={`review-card severity-rule-${current.severity}`}
            id={findingDomId(current.finding.subjectKey)}
            aria-labelledby="review-subject"
          >
            <div className="review-card-kicker">
              <Badge className={severityClass(current.severity)}>{severityLabel(current.severity)}</Badge>
              <span>{kindLabel(current)}</span>
              <span className="review-position">{index + 1} of {queue.length}</span>
            </div>
            <h2 id="review-subject" ref={headingRef} tabIndex={-1}>{current.finding.label}</h2>
            <p className="row-meta">{current.finding.documentTitle}</p>
            <p className="review-why">{current.reason}</p>
            <p className="source-line">{sourceLine(current.finding)}</p>
            <Comparison finding={current.finding} projectId={projectId} />
            <div className="finding-actions">
              <Button type="button" disabled={pendingKey === current.finding.subjectKey} aria-keyshortcuts="A" onClick={() => void review(current.finding, "ACCEPTED")}>
                Accept <kbd>A</kbd>
              </Button>
              <Button type="button" variant={armed === "DISMISSED" ? "default" : "outline"} disabled={pendingKey === current.finding.subjectKey} aria-keyshortcuts="D" onClick={() => void review(current.finding, "DISMISSED")}>
                Dismiss <kbd>D</kbd>
              </Button>
              <Button type="button" variant={armed === "FLAGGED" ? "default" : "ghost"} disabled={pendingKey === current.finding.subjectKey} aria-keyshortcuts="F" onClick={() => void review(current.finding, "FLAGGED")}>
                Flag <kbd>F</kbd>
              </Button>
              <span className="review-move">
                <Button type="button" variant="ghost" size="sm" disabled={queue.length < 2} aria-keyshortcuts="ArrowUp" onClick={() => move(-1)}>Previous</Button>
                <Button type="button" variant="ghost" size="sm" disabled={queue.length < 2} aria-keyshortcuts="ArrowDown" onClick={() => move(1)}>Next</Button>
              </span>
            </div>
            {armed && (
              <label className="review-reason">
                <span>{armed === "DISMISSED" ? "Why are you dismissing this?" : "Why are you flagging this?"}</span>
                <Input
                  ref={reasonRef}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="Required"
                  aria-invalid={Boolean(error)}
                />
              </label>
            )}
          </article>
          <ol className="review-queue">
            {queue.map((item, itemIndex) => (
              <li key={item.finding.subjectKey}>
                <button
                  type="button"
                  className="review-queue-item"
                  aria-current={itemIndex === index ? "true" : undefined}
                  onClick={() => selectIndex(itemIndex)}
                >
                  <Badge className={severityClass(item.severity)}>{severityLabel(item.severity)}</Badge>
                  <span>{item.finding.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
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
          <h3>{side.title}</h3>
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
  return "From the document";
}

function sourceLine(finding: FindingDto) {
  return finding.sources.map((source, sourceIndex) => (
    <span key={source.revisionId}>
      {sourceIndex > 0 && <span className="source-joiner"> to </span>}
      <Link href={`/revisions/${source.revisionId}`}>{source.role === "previous" ? "Previous" : source.role === "current" ? "Current" : "Source"} {source.revisionLabel}</Link>
    </span>
  ));
}

function kindLabel(item: AttentionItemDto) {
  if (item.disposition === "proven_conflict") return "Conflict";
  if (item.disposition === "material_change") return "Change";
  if (item.disposition === "reviewer_flag") return "Flagged";
  return "New";
}

function severityLabel(severity: AttentionItemDto["severity"]) {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "low") return "Low";
  return "Medium";
}

function severityClass(severity: AttentionItemDto["severity"]) {
  if (severity === "critical") return "severity-critical";
  if (severity === "high") return "severity-high";
  if (severity === "low") return "severity-low";
  return "severity-medium";
}

function decisionLabel(decision: Decision) {
  if (decision === "ACCEPTED") return "Accepted";
  if (decision === "DISMISSED") return "Dismissed";
  return "Flagged";
}
