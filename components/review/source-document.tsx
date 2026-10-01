"use client";

import { useEffect, useRef } from "react";
import { locateEvidenceSpan, pageSegments, type EvidenceTarget } from "@/lib/review/evidenceLocation";

export function SourceDocument({
  pages,
  target,
}: {
  pages: Array<{ id: string; pageNumber: number; text: string }>;
  target: EvidenceTarget | null;
}) {
  const targetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    targetRef.current?.scrollIntoView({ block: "center" });
  }, [target?.pageId, target?.start, target?.end, target?.excerpt]);

  return (
    <>
      {pages.map((page) => {
        const active = target?.pageId === page.id;
        const span = active && target ? locateEvidenceSpan(page.text, target.start, target.end, target.excerpt) : null;
        const segments = pageSegments(page.text, span);
        return (
          <section
            className={active ? "page-source page-source-active" : "page-source"}
            id={active ? "evidence" : `page-${page.id}`}
            key={page.id}
            ref={active ? targetRef : undefined}
          >
            <h2>Page {page.pageNumber}</h2>
            {active && target && !span && (
              <p className="source-warning">The stored location does not match this page text, so the excerpt is not highlighted.</p>
            )}
            <pre>
              {page.text
                ? segments.map((segment, index) => (
                  segment.hit
                    ? <mark className="source-hit" key={`${page.id}-${index}`}>{segment.text}</mark>
                    : <span key={`${page.id}-${index}`}>{segment.text}</span>
                ))
                : "No embedded text found on this page."}
            </pre>
          </section>
        );
      })}
    </>
  );
}
