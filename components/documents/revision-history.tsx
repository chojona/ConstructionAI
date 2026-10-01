import Link from "next/link";
import type { RevisionRecord } from "@/lib/domain/types";
import { changeSummary, describeReading, revisionSignals, type RevisionFindingView } from "@/lib/documents/revisionExperience";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(value);

const toneClass = {
  ready: "status-processed",
  waiting: "status-pending",
  failed: "status-failed",
  idle: "status-pending",
} as const;

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

  const latestOrder = Math.max(...revisions.map((revision) => revision.revisionOrder));

  return (
    <ol className="revision-timeline">
      {revisions.map((revision) => {
        const reading = describeReading(revision.status, revision.failureCode, revision.failureMessage);
        const signals = revisionSignals(revision.id, findings);
        const summary = changeSummary(signals);
        const latest = revision.revisionOrder === latestOrder;
        return (
          <li key={revision.id}>
            <Link className="revision-step" href={`/revisions/${revision.id}`}>
              <span className="revision-order" aria-hidden="true">{revision.revisionOrder}</span>
              <span className="revision-copy">
                <span className="row-title">
                  {revision.revisionLabel}
                  {latest ? <span className="latest-mark">Latest</span> : null}
                </span>
                <span className="row-meta">
                  Revision {revision.revisionOrder} · Uploaded {date(revision.createdAt)} · {revision.originalFilename}
                </span>
                {summary ? <span className="row-meta">{summary}</span> : null}
                {reading.tone === "failed" || reading.tone === "waiting" ? (
                  <span className="status-note">{reading.summary}</span>
                ) : null}
              </span>
              <span className={`status-label ${toneClass[reading.tone]}`}>{reading.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
