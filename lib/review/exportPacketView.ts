export const EXPORT_BLOCKED_MESSAGE = "Approve at least one change to export.";
export const EXPORT_OPEN_MESSAGE = "Finish open reviews before exporting.";
export const ADD_ACC_EXPORT_LABEL = "Add pack chapter";
export const ACC_CHAPTER_FILE_LABEL = "File: PDF";
export const ACC_CHAPTER_SOURCE_LABEL = "Source id";
export const ACC_CHAPTER_KIND_LABEL = "Pack chapter";
export const ACC_EXPORT_CHAPTER_TITLE = "ACC export";
export const RFI_PDF_CHAPTER_TITLE = "RFI PDF";
export const ACC_CHAPTER_ADDED_MESSAGE = "Pack chapter added.";

export const ADD_PACK_APPENDIX_LABEL = "Add pack appendix";
export const PACK_APPENDIX_FILE_LABEL = "File: PDF";
export const PACK_APPENDIX_SOURCE_LABEL = "Source id";
export const PACK_APPENDIX_KIND_LABEL = "Pack appendix";
/** Stored on approved packs and in object-store metadata. */
export const BLUEBEAM_MARKUP_APPENDIX_TITLE = "Markup Summary";
/** PE Desk label (Figma CON-65). */
export const BLUEBEAM_MARKUP_APPENDIX_LABEL = "Bluebeam Markup Summary";
export const APPENDIX_ON_ACCEPTED_PACK_ONLY = "Appendix on accepted pack only";
export const PACK_APPENDIX_ADDED_MESSAGE = "Pack appendix added.";

export const DESK_EMPTY_NO_OPEN_CHANGES = "No open changes";
export const DESK_EMPTY_NO_SELECTION = "Select a change or fact to view evidence.";
export const DESK_EMPTY_MISSING_EVIDENCE = "No linked excerpt for this item.";
export const BLUEBEAM_APPENDIX_ROLE = "bluebeam-markup";
export const CONTENT_SHA256_LABEL = "sha256";
export const PACK_PROOF_SOURCE_LABEL = "Source id";
export const PACK_PROOF_FETCHED_LABEL = "Fetched";
export const APPENDIX_PAGE_MISSING_MESSAGE = "This accepted fact has no page cite.";
export const PACK_CITE_UNPINNED_MESSAGE = "A pack cite must name the document revision.";
export const LETTING_NOTICE_NOT_EVIDENCE = "Letting notices are not pack evidence.";

export const ACC_CHAPTER_ROLES = ["acc-docs", "rfi"] as const;
export type AccChapterRole = (typeof ACC_CHAPTER_ROLES)[number];

export interface ExportPacketAction {
  enabled: boolean;
  href: string | null;
  message: typeof EXPORT_BLOCKED_MESSAGE | typeof EXPORT_OPEN_MESSAGE | null;
}

export interface ApprovedChangePreview {
  subjectKey: string;
  decision: "ACCEPTED";
  summary: string;
  evidence: Array<{
    revisionId: string;
    revisionLabel: string;
    pageNumber: number;
    excerpt: string;
    documentPageId?: string | null;
    contentHash?: string | null;
  }>;
}

/**
 * A pack page cite pinned to one DocumentRevision.
 * Field order is the pin: revision, then page, then the immutable page id and content hash.
 * A page number, URL, or document name alone is not a cite.
 */
export interface PackPageCite {
  revisionId: string;
  revisionLabel: string;
  page: string;
  documentPageId: string | null;
  contentHash: string | null;
}

const REVISION_PIN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;
const FLOATING_REVISION = /^(current|latest)$/i;
const LETTING_NOTICE = /\bletting\s*-?\s*board\b|\bnysdot\b[^.\n]{0,40}\bnotice\b|\bnotice\b[^.\n]{0,40}\bnysdot\b/i;

export function isLettingNotice(value: string) {
  return LETTING_NOTICE.test(value);
}

export function canonicalPackPageCite(value: unknown): PackPageCite | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cite = value as Partial<PackPageCite>;
  if (typeof cite.revisionId !== "string" || !isRevisionPin(cite.revisionId)) return null;
  if (typeof cite.revisionLabel !== "string" || !isRevisionLabel(cite.revisionLabel)) return null;
  if (typeof cite.page !== "string" || !isPageToken(cite.page)) return null;
  if (isLettingNotice(cite.page) || isLettingNotice(cite.revisionLabel)) return null;
  const documentPageId = cite.documentPageId ?? null;
  if (documentPageId !== null && !isRevisionPin(documentPageId)) return null;
  const contentHash = cite.contentHash ?? null;
  if (contentHash !== null && (typeof contentHash !== "string" || !CONTENT_HASH.test(contentHash))) return null;
  return {
    revisionId: cite.revisionId,
    revisionLabel: cite.revisionLabel,
    page: cite.page,
    documentPageId,
    contentHash,
  };
}

/** Evidence on an approved pack. A bare page number is not evidence. */
export function isPinnedEvidenceCite(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const cite = value as {
    revisionId?: unknown;
    documentPageId?: unknown;
    pageNumber?: unknown;
    contentHash?: unknown;
    revisionLabel?: unknown;
    documentTitle?: unknown;
    url?: unknown;
  };
  if (typeof cite.pageNumber !== "number" || !Number.isInteger(cite.pageNumber) || cite.pageNumber < 1) return false;
  if (typeof cite.url === "string" && cite.url.trim().length > 0) return false;
  if (typeof cite.revisionLabel === "string" && (FLOATING_REVISION.test(cite.revisionLabel) || isLettingNotice(cite.revisionLabel))) return false;
  if (typeof cite.documentTitle === "string" && isLettingNotice(cite.documentTitle)) return false;
  if ("contentHash" in cite && cite.contentHash !== null && cite.contentHash !== undefined) {
    if (typeof cite.contentHash !== "string" || !CONTENT_HASH.test(cite.contentHash)) return false;
  }
  if (typeof cite.revisionId === "string" && FLOATING_REVISION.test(cite.revisionId)) return false;
  if (typeof cite.revisionId === "string" && isRevisionPin(cite.revisionId)) return true;
  return typeof cite.documentPageId === "string" && isRevisionPin(cite.documentPageId);
}

export function factPageCites(evidence: readonly {
  revisionId?: string;
  revisionLabel?: string;
  pageNumber?: number;
  page?: string;
  documentPageId?: string | null;
  contentHash?: string | null;
}[]): PackPageCite[] {
  const cites: PackPageCite[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    const page = item.page ?? (typeof item.pageNumber === "number" ? String(item.pageNumber) : "");
    const cite = canonicalPackPageCite({
      revisionId: item.revisionId,
      revisionLabel: item.revisionLabel,
      page,
      documentPageId: item.documentPageId ?? null,
      contentHash: item.contentHash ?? null,
    });
    if (!cite) continue;
    const key = `${cite.revisionId}\n${cite.page.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cites.push(cite);
  }
  return cites;
}

/**
 * Markup-summary page labels are not cites until each one is pinned to an accepted fact's revision.
 * A label is never attached to whichever revision is newest.
 */
export function bindMarkupPageCites(filePages: readonly string[], evidenceCites: readonly PackPageCite[]): PackPageCite[] {
  const facts = factPageCites(evidenceCites);
  const labels: string[] = [];
  const seenLabels = new Set<string>();
  for (const raw of filePages) {
    const page = raw.trim();
    const key = page.toLowerCase();
    if (!page || seenLabels.has(key) || isLettingNotice(page)) continue;
    seenLabels.add(key);
    labels.push(page);
  }
  if (labels.length === 0) return facts;
  const revisionIds = [...new Set(facts.map((cite) => cite.revisionId))];
  if (revisionIds.length === 1) {
    const pin = facts[0];
    if (!pin) return [];
    const bound: PackPageCite[] = [];
    for (const page of labels) {
      const match = facts.find((cite) => cite.page.toLowerCase() === page.toLowerCase());
      const cite = canonicalPackPageCite({
        revisionId: pin.revisionId,
        revisionLabel: pin.revisionLabel,
        page,
        documentPageId: match?.documentPageId ?? null,
        contentHash: pin.contentHash,
      });
      if (cite) bound.push(cite);
    }
    return bound.length > 0 ? bound : facts;
  }
  const bound: PackPageCite[] = [];
  for (const page of labels) {
    const matches = facts.filter((cite) => cite.page.toLowerCase() === page.toLowerCase());
    const ids = new Set(matches.map((cite) => cite.revisionId));
    if (ids.size === 1 && matches[0]) bound.push(matches[0]);
  }
  return bound.length > 0 ? bound : facts;
}

export function packPageCiteLabel(cite: Pick<PackPageCite, "revisionLabel" | "page">) {
  return `Rev ${cite.revisionLabel} · p. ${cite.page}`;
}

export function storedPageCiteStrings(cites: readonly unknown[]): string[] | null {
  const pinned = cites.map((cite) => canonicalPackPageCite(cite));
  if (pinned.length === 0 || pinned.some((cite) => cite === null)) return null;
  return pinned.map((cite) => JSON.stringify(cite));
}

export function readStoredPageCites(raw: readonly string[]): PackPageCite[] | null {
  const cites: PackPageCite[] = [];
  for (const value of raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    const cite = canonicalPackPageCite(parsed);
    if (!cite) return null;
    cites.push(cite);
  }
  return cites;
}

function isRevisionPin(value: string) {
  return REVISION_PIN.test(value) && !FLOATING_REVISION.test(value);
}

function isRevisionLabel(value: string) {
  return value.length > 0
    && value.length <= 80
    && value.trim() === value
    && !FLOATING_REVISION.test(value)
    && !/[\u0000-\u001f]/.test(value);
}

function isPageToken(value: string) {
  if (value.length === 0 || value.length > 80 || value.trim() !== value) return false;
  if (/[\u0000-\u001f]/.test(value) || value.includes("://") || /^https?:/i.test(value) || /^www\./i.test(value)) return false;
  if (/^\d+$/.test(value) && Number(value) < 1) return false;
  return true;
}

export function subjectExportVisible(decision: string | null | undefined) {
  return decision === "ACCEPTED";
}

export function approvedChangeExportPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/export`;
}

export function exportPacketAction(approvedCount: number, projectId: string, openCount = 0): ExportPacketAction {
  if (openCount > 0) return { enabled: false, href: null, message: EXPORT_OPEN_MESSAGE };
  if (approvedCount < 1) return { enabled: false, href: null, message: EXPORT_BLOCKED_MESSAGE };
  return { enabled: true, href: approvedChangeExportPath(projectId), message: null };
}

export function accChapterAttachVisible(approvedCount: number) {
  return approvedCount >= 1;
}

export function visiblePacketChanges<T extends { decision: string }>(changes: readonly T[]) {
  return changes.filter((change) => change.decision === "ACCEPTED");
}

export interface DeskPackFile {
  title: string;
  sourceId: string;
  fetchedAt: string;
  contentHash: string;
  pageCites: PackPageCite[];
}

const CONTENT_SHA256_SHORT_LENGTH = 12;

export function appendixFactBinding(
  changes: readonly ApprovedChangePreview[],
  selected: { key: string; decision: string } | null,
) {
  const accepted = selected?.decision === "ACCEPTED"
    ? changes.find((change) => change.subjectKey === selected.key)
    : undefined;
  if (selected?.decision === "ACCEPTED") {
    return { subjectKey: accepted?.subjectKey ?? "", pageCites: factPageCites(accepted?.evidence ?? []) };
  }
  if (selected) return { subjectKey: "", pageCites: [] as PackPageCite[] };
  if (changes.length === 1) {
    const change = changes[0]!;
    return { subjectKey: change.subjectKey, pageCites: factPageCites(change.evidence) };
  }
  return { subjectKey: "", pageCites: factPageCites(changes.flatMap((change) => change.evidence)) };
}

export function shortContentSha256(contentHash: string) {
  return contentHash.slice(0, CONTENT_SHA256_SHORT_LENGTH);
}

export function deskPackFiles(files: readonly {
  title: string;
  sourceId: string;
  fetchedAt: string;
  contentHash: string;
  pageCites?: readonly unknown[];
}[] | undefined): DeskPackFile[] {
  return (files ?? []).map((file) => ({
    title: file.title,
    sourceId: file.sourceId,
    fetchedAt: file.fetchedAt,
    contentHash: file.contentHash,
    pageCites: factPageCites((file.pageCites ?? []).flatMap((cite) => {
      const pinned = canonicalPackPageCite(cite);
      return pinned ? [pinned] : [];
    })),
  }));
}

export function visiblePackProof(files: readonly DeskPackFile[]) {
  return files.filter((file) => (
    file.title.trim().length > 0
    && file.sourceId.trim().length > 0
    && Number.isNaN(Date.parse(file.fetchedAt)) === false
    && /^[a-f0-9]{64}$/.test(file.contentHash)
  ));
}

/** Visible chapter/appendix chrome. A blank source id is already stored as `upload:{sha256}`. */
export function deskAppendixDisplayTitle(title: string) {
  const trimmed = title.trim();
  if (trimmed === BLUEBEAM_MARKUP_APPENDIX_TITLE || trimmed === BLUEBEAM_MARKUP_APPENDIX_LABEL) {
    return BLUEBEAM_MARKUP_APPENDIX_LABEL;
  }
  return trimmed;
}

export function packProofChrome(file: DeskPackFile) {
  return {
    title: deskAppendixDisplayTitle(file.title),
    sourceId: file.sourceId.trim(),
    fetchedAt: file.fetchedAt,
    sha256: shortContentSha256(file.contentHash),
    pageCites: factPageCites(file.pageCites),
  };
}
