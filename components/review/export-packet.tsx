"use client";

import { useState, type FormEvent } from "react";
import { CiteChip } from "@/components/review/cite-chip";
import { DraftEmailButton } from "@/components/review/draft-email";
import { PackProofList } from "@/components/review/pack-proof";
import { Button } from "@/components/ui/button";
import { draftEmailVisible } from "@/lib/email/emailSendView";
import {
  ACC_CHAPTER_ADDED_MESSAGE,
  ACC_CHAPTER_FILE_LABEL,
  ACC_CHAPTER_KIND_LABEL,
  ACC_CHAPTER_SOURCE_LABEL,
  ACC_EXPORT_CHAPTER_TITLE,
  ADD_ACC_EXPORT_LABEL,
  ADD_PACK_APPENDIX_LABEL,
  APPENDIX_ON_ACCEPTED_PACK_ONLY,
  APPENDIX_PAGE_MISSING_MESSAGE,
  BLUEBEAM_APPENDIX_ROLE,
  BLUEBEAM_MARKUP_APPENDIX_LABEL,
  PACK_APPENDIX_ADDED_MESSAGE,
  PACK_APPENDIX_FILE_LABEL,
  PACK_APPENDIX_SOURCE_LABEL,
  RFI_PDF_CHAPTER_TITLE,
  accChapterAttachVisible,
  deskPackFilesFromPacket,
  exportPacketAction,
  subjectExportVisible,
  packPageCiteLabel,
  visiblePackProof,
  visiblePacketChanges,
  type ApprovedChangePreview,
  type DeskPackFile,
  type PackPageCite,
} from "@/lib/review/exportPacketView";

export function ExportPacketControl({
  projectId,
  changes,
  actorId = "",
  openCount = 0,
  chapters = [],
  appendices = [],
  appendixSubjectKey = "",
  appendixPageCites = [],
}: {
  projectId: string;
  changes: readonly ApprovedChangePreview[];
  actorId?: string;
  openCount?: number;
  chapters?: readonly DeskPackFile[];
  appendices?: readonly DeskPackFile[];
  appendixSubjectKey?: string;
  appendixPageCites?: readonly PackPageCite[];
}) {
  const approved = visiblePacketChanges(changes).filter((change) => subjectExportVisible(change.decision));
  const action = exportPacketAction(approved.length, projectId, openCount);
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
      <AccChapterForm projectId={projectId} initialFiles={chapters} />
      <MarkupAppendixForm projectId={projectId} initialFiles={appendices} subjectKey={appendixSubjectKey} pageCites={appendixPageCites} />
    </div>
  );
}

function AccChapterForm({ projectId, initialFiles }: { projectId: string; initialFiles: readonly DeskPackFile[] }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState(() => visiblePackProof(initialFiles));

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
      const result = await response.json() as { packet?: Parameters<typeof deskPackFilesFromPacket>[0]; error?: { message?: string } };
      const proof = visiblePackProof(deskPackFilesFromPacket(result.packet).chapters);
      if (!response.ok || proof.length === 0) {
        setMessage(result.error?.message ?? "Could not add the pack chapter.");
        return;
      }
      setFiles(proof);
      setMessage(ACC_CHAPTER_ADDED_MESSAGE);
      form.reset();
    } catch {
      setMessage("Could not add the pack chapter.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="packet-chapter" aria-label="Pack chapter" onSubmit={onSubmit}>
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
      <PackProofList files={files} />
      {message ? <p className="packet-blocked">{message}</p> : null}
    </form>
  );
}

function MarkupAppendixForm({
  projectId,
  initialFiles,
  subjectKey,
  pageCites,
}: {
  projectId: string;
  initialFiles: readonly DeskPackFile[];
  subjectKey: string;
  pageCites: readonly PackPageCite[];
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState(() => visiblePackProof(initialFiles));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (pageCites.length === 0) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/export/appendices`, {
        method: "POST",
        body: new FormData(form),
      });
      const result = await response.json() as { packet?: Parameters<typeof deskPackFilesFromPacket>[0]; error?: { message?: string } };
      const proof = visiblePackProof(deskPackFilesFromPacket(result.packet).appendices);
      if (!response.ok || proof.length === 0) {
        setMessage(result.error?.message ?? "Could not add the pack appendix.");
        return;
      }
      setFiles(proof);
      setMessage(PACK_APPENDIX_ADDED_MESSAGE);
      form.reset();
    } catch {
      setMessage("Could not add the pack appendix.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="packet-chapter" aria-label="Pack appendix" onSubmit={onSubmit}>
      <p className="packet-appendix-note">{APPENDIX_ON_ACCEPTED_PACK_ONLY}</p>
      <label className="packet-chapter-label" htmlFor={`appendix-file-${projectId}`}>
        {PACK_APPENDIX_FILE_LABEL}
        <input id={`appendix-file-${projectId}`} className="field" name="file" type="file" accept="application/pdf,.pdf,text/csv,.csv" required />
      </label>
      <label className="packet-chapter-label" htmlFor={`appendix-source-${projectId}`}>
        {PACK_APPENDIX_SOURCE_LABEL}
        <input id={`appendix-source-${projectId}`} className="field" name="sourceId" maxLength={200} />
      </label>
      <label className="packet-chapter-label" htmlFor={`appendix-kind-${projectId}`}>
        {BLUEBEAM_MARKUP_APPENDIX_LABEL}
        <select id={`appendix-kind-${projectId}`} className="field" name="kind" defaultValue={BLUEBEAM_APPENDIX_ROLE}>
          <option value={BLUEBEAM_APPENDIX_ROLE}>{BLUEBEAM_MARKUP_APPENDIX_LABEL}</option>
        </select>
      </label>
      {subjectKey && pageCites.length > 0 ? <input type="hidden" name="subjectKey" value={subjectKey} /> : null}
      {pageCites.length > 0 ? (
        <p className="packet-chips" aria-label="Page">
          {pageCites.map((cite) => <CiteChip key={`${cite.revisionId}:${cite.page}`} label={packPageCiteLabel(cite)} />)}
        </p>
      ) : <p className="packet-blocked">{APPENDIX_PAGE_MISSING_MESSAGE}</p>}
      <Button type="submit" variant="outline" disabled={pending || pageCites.length === 0}>{ADD_PACK_APPENDIX_LABEL}</Button>
      <PackProofList files={files} />
      {message ? <p className="packet-blocked">{message}</p> : null}
    </form>
  );
}
