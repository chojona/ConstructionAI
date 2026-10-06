import { formatCiteLabel, UNPINNED_CITE_LABEL } from "./citeLabel";

/** `<Document> · Rev A · p. N` only when the cite is pinned to a DocumentRevision. */
export function pinnedSourceCitation(input: {
  documentTitle?: string | null;
  revisionLabel?: string | null;
  revisionId?: string | null;
  pageNumber?: number | null;
}) {
  const label = formatCiteLabel({
    documentTitle: input.documentTitle,
    revisionLabel: input.revisionLabel,
    revisionId: input.revisionId,
    page: input.pageNumber,
  });
  return label === UNPINNED_CITE_LABEL ? null : label;
}
