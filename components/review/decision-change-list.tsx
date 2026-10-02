import type { DecidedRowChrome } from "@/lib/review/changeRow";

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
              <span className="page-chip">{row.pageLabel}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DecisionEvidence({ row }: { row: DecidedRowChrome }) {
  return (
    <div className="evidence-rail-body">
      {row.pageNumber ? (
        <div className="evidence-rail-lead">
          <span className="page-chip">{row.pageLabel}</span>
          {row.excerpt ? <p className="evidence-rail-excerpt">{row.excerpt}</p> : null}
        </div>
      ) : null}
      <p className="row-meta">{row.documentTitle} · {row.revisionLabel}</p>
      <h3>{row.title}</h3>
    </div>
  );
}
