import type { ReactNode } from "react";
import Link from "next/link";
import type { ExtractionRunRecord, RevisionRecord } from "@/lib/domain/types";
import {
  changeKind,
  changeSummary,
  describeAnalysis,
  describeReading,
  formatBytes,
  revisionSignals,
  type RevisionFindingView,
} from "@/lib/documents/revisionExperience";
import type { EvidenceLocation } from "@/lib/review/evidenceLocation";

const toneClass = {
  ready: "status-processed",
  waiting: "status-pending",
  failed: "status-failed",
  idle: "status-pending",
} as const;

function evidenceHref(evidence: EvidenceLocation, returnTo: string | null) {
  if (!evidence.documentPageId || !Number.isInteger(evidence.startOffset) || !Number.isInteger(evidence.endOffset)) return null;
  const params = new URLSearchParams({
    page: evidence.documentPageId,
    start: String(evidence.startOffset),
    end: String(evidence.endOffset),
    quote: evidence.excerpt,
  });
  if (returnTo) params.set("return", returnTo);
  return `/revisions/${encodeURIComponent(evidence.revisionId)}?${params.toString()}#evidence`;
}

export function RevisionInspection({
  revision,
  siblings,
  runs,
  findings,
  uploadedLabel,
  returnTo,
  navigation,
}: {
  revision: Pick<RevisionRecord, "id" | "documentId" | "revisionLabel" | "revisionOrder" | "originalFilename" | "byteSize" | "status" | "failureCode" | "failureMessage"> & {
    pageCount: number;
  };
  siblings: RevisionRecord[];
  runs: Pick<ExtractionRunRecord, "attemptNumber" | "status" | "failureMessage">[];
  findings: readonly RevisionFindingView[];
  uploadedLabel: string;
  returnTo: string | null;
  navigation?: ReactNode;
}) {
  const reading = describeReading(revision.status, revision.failureCode, revision.failureMessage);
  const analysis = describeAnalysis(runs);
  const signals = revisionSignals(revision.id, findings);
  const ordered = [...siblings].sort((left, right) => left.revisionOrder - right.revisionOrder || left.id.localeCompare(right.id));
  const index = ordered.findIndex((item) => item.id === revision.id);
  const older = index > 0 ? ordered[index - 1] : null;
  const newer = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const shown = signals.changes.length > 0 ? signals.changes : signals.extracted;
  const shownTitle = signals.changes.length > 0 ? "What changed" : "What was extracted";
  const summary = changeSummary(signals);

  return (
    <>
      <div className="revision-identity">
        <p className="revision-position">Revision {revision.revisionOrder} of {ordered.length}</p>
        <h1>{revision.revisionLabel}</h1>
        <nav className="revision-neighbors" aria-label="Other revisions">
          {older ? <Link href={`/revisions/${older.id}`}>Older · {older.revisionLabel}</Link> : <span>Oldest revision</span>}
          {newer ? <Link href={`/revisions/${newer.id}`}>Newer · {newer.revisionLabel}</Link> : <span>Newest revision</span>}
        </nav>
      </div>
      {navigation}

      <dl className="meta-grid">
        <div>
          <dt>File</dt>
          <dd>{revision.originalFilename}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(revision.byteSize)}</dd>
        </div>
        <div>
          <dt>Uploaded</dt>
          <dd>{uploadedLabel}</dd>
        </div>
        <div>
          <dt>Pages</dt>
          <dd>{revision.pageCount}</dd>
        </div>
      </dl>

      <section className={`state-panel state-${reading.tone}`} aria-labelledby="reading-status">
        <div className="state-panel-head">
          <h2 id="reading-status">Reading</h2>
          <span className={`status-label ${toneClass[reading.tone]}`}>{reading.label}</span>
        </div>
        <p>{reading.summary}</p>
        {reading.action ? (
          <p><Link href={`/documents/${revision.documentId}#upload`}>{reading.action}</Link></p>
        ) : null}
      </section>

      <section className={`state-panel state-${analysis.tone}`} aria-labelledby="analysis-status">
        <div className="state-panel-head">
          <h2 id="analysis-status">Analysis</h2>
          <span className={`status-label ${toneClass[analysis.tone]}`}>{analysis.label}</span>
        </div>
        <p>{analysis.summary}{summary ? ` ${summary}.` : ""}</p>
      </section>

      <section className="review-block" aria-labelledby="found-heading">
        <div className="section-heading">
          <h2 id="found-heading">{shownTitle}</h2>
          <span className="count">{shown.length} listed</span>
        </div>
        {shown.length ? (
          <ul className="found-list">
            {shown.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <p className="row-title">{item.label}</p>
                <p className="row-meta">{changeKind(item)}</p>
                <EvidenceJumps evidence={item.evidence} returnTo={returnTo} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty"><strong>Nothing to review yet</strong><span>Extracted items and comparisons will show up after this revision is read.</span></p>
        )}
      </section>
    </>
  );
}

function EvidenceJumps({ evidence, returnTo }: { evidence: EvidenceLocation[]; returnTo: string | null }) {
  const links = evidence.flatMap((item) => {
    const href = evidenceHref(item, returnTo);
    if (!href) return [];
    return [{ href, label: `Page ${item.pageNumber}`, key: `${item.revisionId}-${item.documentPageId}-${item.startOffset}` }];
  });
  if (links.length === 0) return null;
  return (
    <p className="evidence-jumps">
      {links.map((link) => (
        <Link href={link.href} key={link.key}>{link.label}</Link>
      ))}
    </p>
  );
}
