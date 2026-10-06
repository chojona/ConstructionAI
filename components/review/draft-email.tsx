"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { CiteChip } from "@/components/review/cite-chip";
import { PackProofList } from "@/components/review/pack-proof";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { packPageCiteLabel, type DeskPackFile } from "@/lib/review/exportPacketView";
import {
  ACTOR_REQUIRED,
  APPROVED_CHIP,
  ATTACHMENTS_LABEL,
  BODY_REQUIRED,
  DRAFT_EMAIL_ACTION,
  DRAFT_EMAIL_TITLE,
  DRAFT_SAVED_MESSAGE,
  EMAIL_FIELD_LABELS,
  LEDGER_LINK_LABEL,
  PACK_MISSING_MESSAGE,
  RECIPIENT_REQUIRED,
  SEND_RECORDED_MESSAGE,
  SUBJECT_REQUIRED,
  type EmailDraftSource,
  type EmailPackFilePreview,
  type EmailSendView,
} from "@/lib/email/emailSendView";

export function DraftEmailButton({ projectId, actorId }: { projectId: string; actorId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>{DRAFT_EMAIL_ACTION}</Button>
      {open && <DraftEmailPanel projectId={projectId} actorId={actorId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DraftEmailPanel({
  projectId,
  actorId,
  onClose,
}: {
  projectId: string;
  actorId: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [phase, setPhase] = useState<"loading" | "missing" | "ready" | "recorded" | "error">("loading");
  const [source, setSource] = useState<Extract<EmailDraftSource, { ready: true }> | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [actorOverride, setActorOverride] = useState<string | null>(null);
  const [emailId, setEmailId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string; href: string } | null>(null);
  const [pending, setPending] = useState(false);
  const actor = actorOverride ?? actorId;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void loadDraft(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setPhase("error");
        return;
      }
      if (!result.source.ready) {
        setPhase("missing");
        return;
      }
      setSource(result.source);
      setTo(result.source.draft ? result.source.draft.recipients.join(", ") : "");
      setSubject(result.source.subject);
      setBody(result.source.body);
      setEmailId(result.source.draft?.id ?? null);
      if (result.source.draft?.actorId) setActorOverride(result.source.draft.actorId);
      setPhase("ready");
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const reloadPack = useCallback(async () => {
    const result = await loadDraft(projectId);
    if (!result.ok || !result.source.ready) return;
    setSource(result.source);
    setTo(result.source.draft ? result.source.draft.recipients.join(", ") : "");
    setSubject(result.source.subject);
    setBody(result.source.body);
    setEmailId(result.source.draft?.id ?? null);
    if (result.source.draft?.actorId) setActorOverride(result.source.draft.actorId);
    setError("");
    setPhase("ready");
  }, [projectId]);

  useEffect(() => {
    if (phase !== "missing") return;
    const refresh = () => { void reloadPack(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [phase, reloadPack]);

  async function submit(status: "DRAFT" | "SENT") {
    if (!source) return;
    setError("");
    if (!to.trim()) { setError(RECIPIENT_REQUIRED); return; }
    if (!subject.trim()) { setError(SUBJECT_REQUIRED); return; }
    if (!body.trim()) { setError(BODY_REQUIRED); return; }
    if (!actor.trim()) { setError(ACTOR_REQUIRED); return; }
    setPending(true);
    try {
      const response = await fetch(emailId ? `/api/projects/${projectId}/emails/${emailId}` : `/api/projects/${projectId}/emails`, {
        method: emailId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipients: to,
          subject,
          body,
          actorId: actor.trim(),
          exportPacketId: source.exportPacketId,
          status,
        }),
      });
      const result = await response.json() as { email?: EmailSendView; error?: { message?: string } };
      if (!response.ok || !result.email) {
        setError(result.error?.message ?? "Could not record the email.");
        return;
      }
      setEmailId(result.email.id);
      const recorded = { message: status === "SENT" ? SEND_RECORDED_MESSAGE : DRAFT_SAVED_MESSAGE, href: result.email.ledgerPath };
      setNotice(recorded);
      if (status === "SENT") setPhase("recorded");
    } catch {
      setError("Could not record the email. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="email-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="email-panel-head">
        <h2 id={titleId}>{DRAFT_EMAIL_TITLE}</h2>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
      <div className="email-panel-body">
        {phase === "loading" && <p className="row-meta">Loading pack…</p>}
        {phase === "missing" && <p className="packet-blocked">{PACK_MISSING_MESSAGE}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {phase === "recorded" && notice && (
          <p className="email-toast" role="status">{notice.message} <Link href={notice.href}>{LEDGER_LINK_LABEL}</Link></p>
        )}
        {phase === "ready" && source && (
          <form className="email-form" onSubmit={(event) => { event.preventDefault(); void submit("SENT"); }}>
            {notice && <p className="email-toast" role="status">{notice.message} <Link href={notice.href}>{LEDGER_LINK_LABEL}</Link></p>}
            <label className="sticky-reviewer">
              <span>{EMAIL_FIELD_LABELS.to}</span>
              <Input value={to} onChange={(event) => setTo(event.target.value)} autoComplete="off" maxLength={1000} required disabled={pending} />
            </label>
            <label className="sticky-reviewer">
              <span>{EMAIL_FIELD_LABELS.subject}</span>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required disabled={pending} />
            </label>
            <label className="sticky-reviewer">
              <span>{EMAIL_FIELD_LABELS.body}</span>
              <textarea className="field email-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} required disabled={pending} rows={3} />
            </label>
            <label className="sticky-reviewer">
              <span>{EMAIL_FIELD_LABELS.sender}</span>
              <Input value={actor} onChange={(event) => setActorOverride(event.target.value)} autoComplete="name" maxLength={120} required disabled={pending} />
            </label>
            <div>
              <p className="packet-kicker">{ATTACHMENTS_LABEL}</p>
              <ul className="packet-preview" aria-label={ATTACHMENTS_LABEL}>
                {source.attachments.map((item) => (
                  <li key={item.decisionId}>
                    <span className="packet-summary">{item.summary}</span>
                    <span className="packet-chips">
                      <span className="page-chip">{APPROVED_CHIP}</span>
                      {item.evidence.map((evidence) => (
                        evidence.revisionLabel ? (
                          <CiteChip
                            key={`${item.decisionId}:${evidence.revisionId}:${evidence.pageNumber}:${evidence.excerpt}`}
                            title={evidence.excerpt}
                            label={packPageCiteLabel({
                              revisionId: evidence.revisionId,
                              revisionLabel: evidence.revisionLabel,
                              page: String(evidence.pageNumber),
                              documentTitle: item.documentTitle,
                            })}
                          />
                        ) : null
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <PackProofList files={[...source.chapters, ...source.appendices].map(deskPackFile)} />
            </div>
            <div className="packet-actions">
              <Button type="submit" disabled={pending}>Send</Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void submit("DRAFT")}>Save draft</Button>
              {pending && <span role="status">Saving…</span>}
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}

function deskPackFile(file: EmailPackFilePreview): DeskPackFile {
  return {
    title: file.title,
    sourceId: file.sourceId,
    fetchedAt: file.fetchedAt,
    contentHash: file.contentHash,
    pageCites: file.pageCites,
  };
}

async function loadDraft(projectId: string): Promise<{ ok: true; source: EmailDraftSource } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/projects/${projectId}/email-draft`);
    const result = await response.json() as EmailDraftSource & { error?: { message?: string } };
    if (!response.ok) return { ok: false, message: result.error?.message ?? "Could not open the draft." };
    return { ok: true, source: result };
  } catch {
    return { ok: false, message: "Could not open the draft. Check your connection and try again." };
  }
}
