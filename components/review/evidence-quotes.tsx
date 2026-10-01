import Link from "next/link";
import { evidenceHref, type EvidenceLocation } from "@/lib/review/evidenceLocation";

export function EvidenceQuotes({ items, returnTo }: { items: EvidenceLocation[]; returnTo: string }) {
  if (!items.length) return null;
  return (
    <div className="evidence-list">
      {items.map((item) => {
        const href = evidenceHref(item, returnTo);
        const quote = `“${item.excerpt}”`;
        return (
          <blockquote className="evidence-note" key={`${item.revisionId}-${item.documentPageId}-${item.startOffset}-${item.endOffset}`}>
            <p className="evidence-kicker">Source · {item.documentTitle} · {item.revisionLabel} · Page {item.pageNumber}</p>
            {href ? <Link href={href}>{quote}</Link> : <span>{quote}</span>}
          </blockquote>
        );
      })}
    </div>
  );
}
