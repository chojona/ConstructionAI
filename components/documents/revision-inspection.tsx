import type { ReactNode } from "react";
import Link from "next/link";
import type { ExtractionRunRecord, RevisionRecord } from "@/lib/domain/types";
import { documentRegisterStatus, registerStatusClass, revisionIsLatest } from "@/lib/documents/documentRegister";
import {
  changeKind,
  changeSummary,
  describeAnalysis,
  describeReading,
  emptyExtractCopy,
  formatBytes,
  revisionSignals,
  type RevisionFindingView,
} from "@/lib/documents/revisionExperience";
import { formatCiteLabel } from "@/lib/review/citeLabel";
import type { EvidenceLocation } from "@/lib/review/evidenceLocation";

type InspectionFinding = RevisionFindingView & {
  before?: { evidence: EvidenceLocation[] } | null;
  after?: { evidence: EvidenceLocation[] } | null;
};

const toneClass = {
  ready: "status-processed",
  waiting: "status-pending",
  failed: "status-failed",
  idle: "status-muted",
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
  findings: readonly InspectionFinding[];
  uploadedLabel: string;
  returnTo: string | null;
  navigation?: ReactNode;
}) {
  const isLatest = revisionIsLatest(revision, siblings);
  const status = documentRegisterStatus(isLatest, revision.status) ?? "Failed";
  const reading = describeReading(revision.status, revision.failureCode, revision.failureMessage, isLatest);
  const signals = revisionSignals(revision.id, findings);
  const ordered = [...siblings].sort((left, right) => left.revisionOrder - right.revisionOrder || left.id.localeCompare(right.id));
  const uploadTotal = ordered.some((item) => item.id === revision.id) ? ordered.length : ordered.length + 1;
  const index = ordered.findIndex((item) => item.id === revision.id);
  const older = index > 0 ? ordered[index - 1] : null;
  const newer = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const shown = signals.changes.length > 0 ? signals.changes : signals.extracted;
  const shownTitle = signals.changes.length > 0 ? "What changed" : "What was extracted";
  const summary = changeSummary(signals);
  const analysis = describeAnalysis(runs, shown.length);
  const analysisLine = [analysis.summary, summary ? `${summary}.` : ""].filter(Boolean).join(" ");

  return (
    <>
      <div className="revision-identity">
        <p className="revision-position">Upload {revision.revisionOrder} of {uploadTotal}</p>
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

      <section className={`state-panel state-${reading.tone}${status === "Superseded" ? " is-superseded" : ""}`} aria-labelledby="reading-status">
        <div className="state-panel-head">
          <h2 id="reading-status">Reading</h2>
          <span className={`status-label ${registerStatusClass(status)}`}>{status}</span>
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
        {analysisLine ? <p>{analysisLine}</p> : null}
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
                <EvidenceJumps evidence={jumpEvidence(item)} viewedRevisionId={revision.id} returnTo={returnTo} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-compact">{emptyExtractCopy(reading.tone)}</p>
        )}
      </section>
    </>
  );
}

function jumpEvidence(item: InspectionFinding): EvidenceLocation[] {
  const sided = [...(item.before?.evidence ?? []), ...(item.after?.evidence ?? [])];
  const items = sided.length > 0 ? sided : item.evidence;
  const seen = new Set<string>();
  const unique: EvidenceLocation[] = [];
  for (const evidence of items) {
    const key = `${evidence.revisionId}\n${evidence.documentPageId ?? ""}\n${evidence.pageNumber}\n${evidence.startOffset}\n${evidence.endOffset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(evidence);
  }
  return unique;
}

function EvidenceJumps({
  evidence,
  viewedRevisionId,
  returnTo,
}: {
  evidence: EvidenceLocation[];
  viewedRevisionId: string;
  returnTo: string | null;
}) {
  const links = evidence.flatMap((item) => {
    const href = evidenceHref(item, returnTo);
    if (!href) return [];
    return [{
      href,
      label: formatCiteLabel({
        surface: "jump",
        revisionLabel: item.revisionLabel,
        revisionId: item.revisionId,
        viewedRevisionId,
        page: item.pageNumber,
      }),
      key: `${item.revisionId}-${item.documentPageId}-${item.startOffset}`,
    }];
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
