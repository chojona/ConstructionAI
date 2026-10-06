"use client";

import { useState } from "react";
import {
  hasLinkedPreviewExcerpt,
  PAGE_PREVIEW_OPEN_LABEL,
  PAGE_PREVIEW_UNAVAILABLE_MESSAGE,
  previewFailureMessage,
} from "@/lib/review/pagePreviewCopy";

export function pagePreviewSrc(projectId: string, revisionId: string, pageNumber: number) {
  return `/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/pages/${pageNumber}`;
}

export function revisionDocumentHref(revisionId: string) {
  return `/revisions/${encodeURIComponent(revisionId)}`;
}

export function PagePreviewNotice({ message }: { message: string }) {
  return <p className="page-preview-unavailable">{message}</p>;
}

export function PagePreview({
  projectId,
  revisionId,
  pageNumber,
  excerpt = "",
  failureCode = null,
}: {
  projectId: string;
  revisionId: string | null;
  pageNumber: number;
  excerpt?: string | null;
  /** Server error already known for this page. Omit while the image can still load. */
  failureCode?: string | null;
}) {
  const canPreview = Boolean(revisionId) && Number.isInteger(pageNumber) && pageNumber > 0;
  const src = canPreview && revisionId ? pagePreviewSrc(projectId, revisionId, pageNumber) : null;
  const linkedExcerpt = hasLinkedPreviewExcerpt(excerpt);
  const [failure, setFailure] = useState<{ src: string; message: string } | null>(null);
  const href = revisionId ? revisionDocumentHref(revisionId) : null;
  const reported = failure?.src === src
    ? failure.message
    : failureCode
      ? previewFailureMessage({ error: { code: failureCode } }, linkedExcerpt)
      : null;
  const notice = reported ?? PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
  const unavailable = !src || reported !== null;

  return (
    <div className="page-preview">
      {unavailable || !src ? (
        <PagePreviewNotice message={notice} />
      ) : (
        <div className="page-preview-scroll">
          {/* The page is rendered by an authenticated route, not a static asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Page ${pageNumber}`}
            onError={() => {
              const requested = src;
              setFailure({ src: requested, message: PAGE_PREVIEW_UNAVAILABLE_MESSAGE });
              void fetch(requested).then(async (response) => {
                const body: unknown = await response.json().catch(() => null);
                setFailure((current) => current?.src === requested
                  ? { src: requested, message: previewFailureMessage(body, linkedExcerpt) }
                  : current);
              }).catch(() => undefined);
            }}
          />
        </div>
      )}
      {href ? <a className="page-preview-open" href={href}>{PAGE_PREVIEW_OPEN_LABEL}</a> : null}
    </div>
  );
}
