import { CiteChip } from "@/components/review/cite-chip";
import { FactBadges } from "@/components/review/fact-badges";
import { PagePreview } from "@/components/review/page-preview";
import type { DecidedRowChrome } from "@/lib/review/changeRow";
import { knownDocRevLine } from "@/lib/review/citeLabel";
import { DESK_EMPTY_MISSING_EVIDENCE } from "@/lib/review/exportPacketView";

export function DecisionChangeList({
  rows,
  activeKey = "",
  onSelect,
}: {
  rows: readonly DecidedRowChrome[];
  activeKey?: string;
  onSelect?: (row: DecidedRowChrome) => void;
}) {
  return (
    <ul className="fact-list" aria-label="Facts">
      {rows.map((row) => {
        const active = row.key === activeKey;
        return (
          <li key={row.key}>
            <button type="button" className={`fact-row${active ? " is-active" : ""}`} aria-pressed={active} onClick={() => onSelect?.(row)}>
              <span className="fact-row-copy">
                <span className="row-title">{row.title}</span>
                <span className="row-meta">{row.documentTitle}</span>
              </span>
              <CiteChip label={row.pageLabel} status={row.pinStatus} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DecisionEvidence({ row, projectId }: { row: DecidedRowChrome; projectId: string }) {
  const missingExcerpt = !row.excerpt.trim() || row.excerpt === "No linked excerpt available.";
  const docRev = row.pinStatus === "Unpinned" ? knownDocRevLine({
    documentTitle: row.evidenceDocumentTitle || row.documentTitle,
    revisionLabel: row.evidenceRevisionLabel || row.revisionLabel,
  }) : null;
  return (
    <div className="evidence-rail-body">
      {row.pageNumber ? (
        <div className="evidence-rail-lead">
          <CiteChip label={row.pageLabel} status={row.pinStatus} />
          {docRev ? <p className="row-meta">{docRev}</p> : null}
          {missingExcerpt ? <p className="rail-empty rail-empty-inline">{DESK_EMPTY_MISSING_EVIDENCE}</p> : <p className="evidence-rail-excerpt">{row.excerpt}</p>}
          <PagePreview projectId={projectId} revisionId={row.revisionId} pageNumber={row.pageNumber} />
        </div>
      ) : missingExcerpt ? <p className="rail-empty rail-empty-inline">{DESK_EMPTY_MISSING_EVIDENCE}</p> : null}
      {row.pageNumber || !docRev ? null : <p className="row-meta">{docRev}</p>}
      {row.badges?.length ? <FactBadges badges={row.badges} /> : null}
      <h3>{row.title}</h3>
    </div>
  );
}
