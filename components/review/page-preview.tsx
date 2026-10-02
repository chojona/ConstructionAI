"use client";

import { useState } from "react";
import { PAGE_PREVIEW_OPEN_LABEL, PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "@/lib/review/pagePreviewCopy";

export function pagePreviewSrc(projectId: string, revisionId: string, pageNumber: number) {
  return `/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/pages/${pageNumber}`;
}

export function revisionDocumentHref(revisionId: string) {
  return `/revisions/${encodeURIComponent(revisionId)}`;
}

export function PagePreview({
  projectId,
  revisionId,
  pageNumber,
}: {
  projectId: string;
  revisionId: string | null;
  pageNumber: number;
}) {
  const canPreview = Boolean(revisionId) && Number.isInteger(pageNumber) && pageNumber > 0;
  const [unavailable, setUnavailable] = useState(!canPreview);
  const href = revisionId ? revisionDocumentHref(revisionId) : null;

  return (
    <div className="page-preview">
      {unavailable || !revisionId ? (
        <p className="page-preview-unavailable">{PAGE_PREVIEW_UNAVAILABLE_MESSAGE}</p>
      ) : (
        <div className="page-preview-scroll">
          {/* The page is rendered by an authenticated route, not a static asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pagePreviewSrc(projectId, revisionId, pageNumber)}
            alt={`Page ${pageNumber}`}
            onError={() => setUnavailable(true)}
          />
        </div>
      )}
      {href ? <a className="page-preview-open" href={href}>{PAGE_PREVIEW_OPEN_LABEL}</a> : null}
    </div>
  );
}
