/** `<Document> · <Rev> · p. N` only when the cite is pinned to a DocumentRevision. */
export function pinnedSourceCitation(input: {
  documentTitle?: string | null;
  revisionLabel?: string | null;
  revisionId?: string | null;
  pageNumber?: number | null;
}) {
  const documentTitle = input.documentTitle?.trim() ?? "";
  const revisionLabel = input.revisionLabel?.trim() ?? "";
  const revisionId = input.revisionId?.trim() ?? "";
  const pageNumber = input.pageNumber;
  if (!documentTitle || !revisionLabel || !revisionId) return null;
  if (typeof pageNumber !== "number" || !Number.isInteger(pageNumber) || pageNumber <= 0) return null;
  return `${documentTitle} · ${revisionLabel} · p. ${pageNumber}`;
}
