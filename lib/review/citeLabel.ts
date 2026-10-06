/** Visible cite when the lead is not pinned to one document revision. */
export const UNPINNED_CITE_LABEL = "Unpinned";

export type CiteLabelInput = {
  documentTitle?: string | null;
  revisionLabel?: string | null;
  revisionId?: string | null;
  page?: number | string | null;
  /**
   * Revision currently open. Jump links omit the revision name when it matches.
   * Cite chips always name the document and revision.
   */
  viewedRevisionId?: string | null;
  /** "cite" is `Doc · Rev A · p. 2`. "jump" is `p. 2` or `Rev A · p. 2`. */
  surface?: "cite" | "jump";
};

/**
 * One cite label for change rows, the evidence rail, revision jumps, and pack chips.
 * `Rev` is added once. A stored label that already starts with "Rev" (Rev A, Revision C) is kept.
 */
export function formatCiteLabel(input: CiteLabelInput): string {
  const page = pageToken(input.page);
  const revisionId = input.revisionId?.trim() ?? "";
  const revision = displayRevision(input.revisionLabel);
  if (input.surface === "jump") {
    if (!page) return UNPINNED_CITE_LABEL;
    const viewedRevisionId = input.viewedRevisionId?.trim() ?? "";
    if (revisionId && viewedRevisionId && revisionId === viewedRevisionId) return `p. ${page}`;
    if (!revision) return UNPINNED_CITE_LABEL;
    return `${revision} · p. ${page}`;
  }
  const documentTitle = input.documentTitle?.trim() ?? "";
  if (!documentTitle || !revision || !revisionId || !page) return UNPINNED_CITE_LABEL;
  return `${documentTitle} · ${revision} · p. ${page}`;
}

export function citeChipClassName(label: string) {
  return label === UNPINNED_CITE_LABEL ? "page-chip is-unpinned" : "page-chip";
}

function displayRevision(revisionLabel: string | null | undefined) {
  const label = revisionLabel?.trim() ?? "";
  if (!label) return null;
  if (/^rev/i.test(label)) return label;
  return `Rev ${label}`;
}

function pageToken(page: number | string | null | undefined) {
  if (typeof page === "number") {
    if (!Number.isInteger(page) || page <= 0) return null;
    return String(page);
  }
  if (typeof page !== "string") return null;
  const trimmed = page.trim();
  if (!trimmed || (/^\d+$/.test(trimmed) && Number(trimmed) < 1)) return null;
  return trimmed;
}
