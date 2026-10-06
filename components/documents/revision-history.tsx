import Link from "next/link";
import type { RevisionRecord } from "@/lib/domain/types";
import { documentRegisterStatus, registerStatusClass, revisionIsLatest } from "@/lib/documents/documentRegister";
import { changeSummary, describeReading, revisionSignals, type RevisionFindingView } from "@/lib/documents/revisionExperience";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(value);

export function RevisionHistory({
  revisions,
  findings,
}: {
  revisions: RevisionRecord[];
  findings: readonly RevisionFindingView[];
}) {
  if (revisions.length === 0) {
    return <div className="empty"><strong>No revisions yet</strong><span>Upload the first PDF for this document.</span></div>;
  }

  return (
    <ol className="revision-timeline">
      {revisions.map((revision) => {
        const isLatest = revisionIsLatest(revision, revisions);
        const status = documentRegisterStatus(isLatest, revision.status) ?? "Failed";
        const reading = describeReading(revision.status, revision.failureCode, revision.failureMessage, isLatest);
        const signals = revisionSignals(revision.id, findings);
        const summary = changeSummary(signals);
        const note = status === "Failed" || status === "Processing" ? reading.summary : null;
        return (
          <li key={revision.id}>
            <Link className={status === "Superseded" ? "revision-step is-superseded" : "revision-step"} href={`/revisions/${revision.id}`}>
              <span className="revision-order" aria-hidden="true">{revision.revisionOrder}</span>
              <span className="revision-copy">
                <span className="row-title">{revision.revisionLabel}</span>
                <span className="row-meta">
                  Upload {revision.revisionOrder} of {revisions.length} · Uploaded {date(revision.createdAt)} · {revision.originalFilename}
                </span>
                {summary ? <span className="row-meta">{summary}</span> : null}
                {note ? <span className="status-note">{note}</span> : null}
              </span>
              <span className={`status-label ${registerStatusClass(status)}`}>{status}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
