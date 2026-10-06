/** Visible cite when the lead is not pinned to one document revision. */
export const UNPINNED_CITE_LABEL = "Unpinned";

export type CitePinStatus = "Pinned" | "Unpinned";

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
  /** "cite" is `Doc · Rev A · p. 2` or `Doc · Rev A · Sheet C-101`. "jump" names the other revision the same way. */
  surface?: "cite" | "jump";
};

const REVISION_NAME_UNPREFIXED = new Set(["ifc", "ifb", "bid"]);
const POSITIVE_PAGE = /^[1-9]\d*$/;

/**
 * Page text shared with markup chips. A positive integer is `p. N`.
 * Any other sheet label is `Sheet C-101`, and a label that already says Sheet is not doubled.
 */
export function sheetCiteDisplay(label: string) {
  if (POSITIVE_PAGE.test(label)) return `p. ${label}`;
  const bare = label.replace(/^sheet\s+/i, "").trim();
  return `Sheet ${bare || label}`;
}

/**
 * Revision text for a cite or a reason (`not in ${displayRevision(label)}`).
 * `Rev` is added only for a short code (A, 2, B1). Stored labels that already
 * start with "Rev", run longer than three characters, contain a space, or are
 * IFC / IFB / Bid stay as written so nothing doubles.
 */
export function displayRevision(revisionLabel: string | null | undefined): string | null {
  const label = revisionLabel?.trim() ?? "";
  if (!label) return null;
  if (/^rev/i.test(label)) return label;
  if (REVISION_NAME_UNPREFIXED.has(label.toLowerCase())) return label;
  if (label.length > 3 || /\s/.test(label)) return label;
  if (/^[A-Za-z0-9]{1,3}$/.test(label)) return `Rev ${label}`;
  return label;
}

/** Document and revision line for an unpinned rail, when either is known. */
export function knownDocRevLine(input: {
  documentTitle?: string | null;
  revisionLabel?: string | null;
}): string | null {
  const documentTitle = input.documentTitle?.trim() ?? "";
  const revision = displayRevision(input.revisionLabel);
  if (documentTitle && revision) return `${documentTitle} · ${revision}`;
  return documentTitle || revision;
}

type CiteParts = {
  page: string | null;
  revisionId: string;
  revision: string | null;
  documentTitle: string;
  viewedRevisionId: string;
  surface: "cite" | "jump";
};

function citeParts(input: CiteLabelInput): CiteParts {
  return {
    page: pageToken(input.page),
    revisionId: input.revisionId?.trim() ?? "",
    revision: displayRevision(input.revisionLabel),
    documentTitle: input.documentTitle?.trim() ?? "",
    viewedRevisionId: input.viewedRevisionId?.trim() ?? "",
    surface: input.surface ?? "cite",
  };
}

/** Pin state from the cite fields. The rendered word "Unpinned" is not consulted. */
export function citePinStatus(input: CiteLabelInput): CitePinStatus {
  const parts = citeParts(input);
  if (parts.surface === "jump") {
    if (!parts.page || !parts.revisionId) return "Unpinned";
    if (parts.viewedRevisionId && parts.revisionId === parts.viewedRevisionId) return "Pinned";
    return parts.revision ? "Pinned" : "Unpinned";
  }
  if (!parts.documentTitle || !parts.revision || !parts.revisionId || !parts.page) return "Unpinned";
  return "Pinned";
}

/**
 * One cite label for change rows, the evidence rail, revision jumps, and pack chips.
 */
export function formatCiteLabel(input: CiteLabelInput): string {
  const parts = citeParts(input);
  if (parts.surface === "jump") {
    if (!parts.page || !parts.revisionId) return UNPINNED_CITE_LABEL;
    if (parts.viewedRevisionId && parts.revisionId === parts.viewedRevisionId) return parts.page;
    if (!parts.revision) return UNPINNED_CITE_LABEL;
    return `${parts.revision} · ${parts.page}`;
  }
  if (citePinStatus(input) === "Unpinned") return UNPINNED_CITE_LABEL;
  return `${parts.documentTitle} · ${parts.revision} · ${parts.page}`;
}

function pageToken(page: number | string | null | undefined) {
  if (typeof page === "number") {
    if (!Number.isInteger(page) || page <= 0) return null;
    return sheetCiteDisplay(String(page));
  }
  if (typeof page !== "string") return null;
  const trimmed = page.trim();
  if (!trimmed || (/^\d+$/.test(trimmed) && Number(trimmed) < 1)) return null;
  return sheetCiteDisplay(trimmed);
}
