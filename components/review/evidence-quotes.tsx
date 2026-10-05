import Link from "next/link";
import { evidenceHref, type EvidenceLocation } from "@/lib/review/evidenceLocation";
import { pinnedSourceCitation } from "@/lib/review/sourceCitation";

export function EvidenceQuotes({ items, returnTo }: { items: EvidenceLocation[]; returnTo: string }) {
  if (!items.length) return null;
  return (
    <div className="evidence-list">
      {items.map((item) => {
        const href = evidenceHref(item, returnTo);
        const quote = `“${item.excerpt}”`;
        const citation = pinnedSourceCitation(item);
        return (
          <blockquote className="evidence-note" key={`${item.revisionId}-${item.documentPageId}-${item.startOffset}-${item.endOffset}`}>
            {citation ? <p className="evidence-kicker">{citation}</p> : null}
            {href ? <Link href={href}>{quote}</Link> : <span>{quote}</span>}
          </blockquote>
        );
      })}
    </div>
  );
}
