"use client";

import { useState, type FormEvent } from "react";
import { DraftEmailButton } from "@/components/review/draft-email";
import { Button } from "@/components/ui/button";
import { draftEmailVisible } from "@/lib/email/emailSendView";
import {
  ACC_CHAPTER_ADDED_MESSAGE,
  ACC_CHAPTER_FILE_LABEL,
  ACC_CHAPTER_KIND_LABEL,
  ACC_CHAPTER_SOURCE_LABEL,
  ACC_EXPORT_CHAPTER_TITLE,
  ADD_ACC_EXPORT_LABEL,
  RFI_PDF_CHAPTER_TITLE,
  accChapterAttachVisible,
  exportPacketAction,
  subjectExportVisible,
  visiblePacketChanges,
  type ApprovedChangePreview,
} from "@/lib/review/exportPacketView";

export function ExportPacketControl({
  projectId,
  changes,
  actorId = "",
}: {
  projectId: string;
  changes: readonly ApprovedChangePreview[];
  actorId?: string;
}) {
  const approved = visiblePacketChanges(changes).filter((change) => subjectExportVisible(change.decision));
  const action = exportPacketAction(approved.length, projectId);
  if (!action.enabled || !action.href || !accChapterAttachVisible(approved.length)) {
    return <p className="packet-blocked">{action.message}</p>;
  }
  return (
    <div className="packet-export">
      <div className="packet-actions">
        <Button asChild>
          <a href={action.href} download="approved-pack.json">Export approved pack</a>
        </Button>
        {draftEmailVisible(approved.length) && <DraftEmailButton projectId={projectId} actorId={actorId} />}
      </div>
      <AccChapterForm projectId={projectId} />
    </div>
  );
}

function AccChapterForm({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/export/chapters`, {
        method: "POST",
        body: new FormData(form),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(result.error?.message ?? "Could not add the pack chapter.");
        return;
      }
      setMessage(ACC_CHAPTER_ADDED_MESSAGE);
      form.reset();
    } catch {
      setMessage("Could not add the pack chapter.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="packet-chapter" onSubmit={onSubmit}>
      <label className="packet-chapter-label" htmlFor={`acc-chapter-file-${projectId}`}>
        {ACC_CHAPTER_FILE_LABEL}
        <input id={`acc-chapter-file-${projectId}`} className="field" name="file" type="file" accept="application/pdf,.pdf" required />
      </label>
      <label className="packet-chapter-label" htmlFor={`acc-chapter-source-${projectId}`}>
        {ACC_CHAPTER_SOURCE_LABEL}
        <input id={`acc-chapter-source-${projectId}`} className="field" name="sourceId" maxLength={200} />
      </label>
      <label className="packet-chapter-label" htmlFor={`acc-chapter-role-${projectId}`}>
        {ACC_CHAPTER_KIND_LABEL}
        <select id={`acc-chapter-role-${projectId}`} className="field" name="role" defaultValue="acc-docs">
          <option value="acc-docs">{ACC_EXPORT_CHAPTER_TITLE}</option>
          <option value="rfi">{RFI_PDF_CHAPTER_TITLE}</option>
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={pending}>{ADD_ACC_EXPORT_LABEL}</Button>
      {message ? <p className="packet-blocked">{message}</p> : null}
    </form>
  );
}
