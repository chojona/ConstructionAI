import { citePinStatus, displayRevision, formatCiteLabel, type CitePinStatus } from "./citeLabel";

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
export const LEGACY_PAGE_CITE_MESSAGE = "Page cites are not pinned to a document revision. Re-attach this appendix.";
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
    documentTitle?: string | null;
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
  /**
   * Display only. Canonical pins omit this so stored JSON stays the revision pin.
   * Resolved from the accepted change when the chip is rendered.
   */
  documentTitle?: string;
}

/** One DocumentPage row used to validate a markup label. Page count is `pages.length`. */
export interface MarkupRevisionPage {
  id: string;
  pageNumber: number;
  /** Set when the revision stores a sheet number for this page (C-101, A-201, S-3.1). */
  sheetNumber?: string | null;
}

/** Accepted-fact DocumentRevision, with the page rows that bound its page count. */
export interface MarkupRevisionPages {
  revisionId: string;
  revisionLabel: string;
  contentHash: string | null;
  pages: readonly MarkupRevisionPage[];
}

/**
 * A markup label that did not resolve to a DocumentPage.
 * It stays on the appendix row so it is not dropped and is not stored as a pin.
 */
export interface MarkupUnpinnedCite {
  status: "Unpinned";
  label: string;
  display: string;
  reason: string;
  revisionId: string | null;
  revisionLabel: string | null;
}

export type AppendixPageCite = PackPageCite | MarkupUnpinnedCite;

const INTEGER_PAGE = /^[1-9]\d*$/;
const SHEET_NOT_MATCHED = "not matched";
const PAGE_NOT_MATCHED = "page not matched";

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
  documentTitle?: string | null;
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
    const documentTitle = item.documentTitle?.trim() ?? "";
    cites.push(documentTitle ? { ...cite, documentTitle } : cite);
  }
  return cites;
}

/**
 * Markup-summary page labels are not cites until each one resolves to a DocumentPage
 * on an accepted fact's revision. A label is never attached to whichever revision is newest.
 * Numeric labels pin only when `1 <= N <= page count` and that page row exists.
 * Anything that is not an integer is a sheet label: map it when a page stores that sheet,
 * otherwise keep it unpinned as "Sheet …". Unmatched labels stay on the row.
 */
export function bindMarkupPageCites(
  filePages: readonly string[],
  evidenceCites: readonly PackPageCite[],
  revisions?: readonly MarkupRevisionPages[],
): AppendixPageCite[] {
  const facts = factPageCites(evidenceCites);
  const labels = markupLabels(filePages);
  if (labels.length === 0) return facts;
  const checked = markupRevisions(facts, revisions);
  return labels.map((label) => resolveMarkupLabel(label, checked));
}

/** Shown when a markup summary pins no page. Lists each unmatched label. Does not substitute the fact's pages. */
export function appendixPageMissingMessage(cites: readonly AppendixPageCite[]) {
  const unmatched = cites.filter(isUnpinnedAppendixCite);
  if (unmatched.length === 0) return APPENDIX_PAGE_MISSING_MESSAGE;
  const details = unmatched.map((cite) => `${cite.display} ${cite.reason}`);
  return `${APPENDIX_PAGE_MISSING_MESSAGE} ${details.join(". ")}.`;
}

export function isUnpinnedAppendixCite(cite: AppendixPageCite): cite is MarkupUnpinnedCite {
  return "status" in cite && cite.status === "Unpinned";
}

export function canonicalAppendixPageCite(value: unknown): AppendixPageCite | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<MarkupUnpinnedCite>;
  if (row.status === "Unpinned") return canonicalUnpinnedCite(row);
  return canonicalPackPageCite(value);
}

export function packPageCiteChip(cite: Pick<PackPageCite, "revisionLabel" | "page"> & {
  revisionId?: string | null;
  documentTitle?: string | null;
}): { label: string; status: CitePinStatus } {
  const input = {
    documentTitle: cite.documentTitle,
    revisionLabel: cite.revisionLabel,
    revisionId: cite.revisionId,
    page: cite.page,
  };
  return { label: formatCiteLabel(input), status: citePinStatus(input) };
}

export function packPageCiteLabel(cite: Pick<PackPageCite, "revisionLabel" | "page"> & {
  revisionId?: string | null;
  documentTitle?: string | null;
}) {
  return packPageCiteChip(cite).label;
}

export function documentTitlesFromChanges(changes: readonly {
  document?: { title?: string | null } | null;
  evidence?: readonly { revisionId?: string | null }[] | null;
  revisions?: readonly { id?: string | null }[] | null;
}[] | null | undefined) {
  const titles = new Map<string, string>();
  for (const change of changes ?? []) {
    const title = change.document?.title?.trim() ?? "";
    if (!title) continue;
    for (const revision of change.revisions ?? []) {
      const id = revision.id?.trim();
      if (id) titles.set(id, title);
    }
    for (const item of change.evidence ?? []) {
      const id = item.revisionId?.trim();
      if (id) titles.set(id, title);
    }
  }
  return titles;
}

export function citeWithDocumentTitle(cite: AppendixPageCite, titles: ReadonlyMap<string, string>): AppendixPageCite {
  if (isUnpinnedAppendixCite(cite)) return cite;
  const documentTitle = cite.documentTitle?.trim() || titles.get(cite.revisionId)?.trim() || "";
  if (!documentTitle || cite.documentTitle === documentTitle) return cite;
  return { ...cite, documentTitle };
}

function citeKeepingDocumentTitle(row: AppendixPageCite, source: unknown): AppendixPageCite {
  if (isUnpinnedAppendixCite(row)) return row;
  const documentTitle = source && typeof source === "object" && "documentTitle" in source && typeof source.documentTitle === "string"
    ? source.documentTitle.trim()
    : "";
  return documentTitle ? { ...row, documentTitle } : row;
}

function attachUnknownCiteTitle(cite: unknown, titles: ReadonlyMap<string, string>) {
  if (!cite || typeof cite !== "object") return cite;
  const record = cite as { revisionId?: unknown; documentTitle?: unknown };
  const revisionId = typeof record.revisionId === "string" ? record.revisionId : "";
  const existing = typeof record.documentTitle === "string" ? record.documentTitle.trim() : "";
  const documentTitle = existing || (revisionId ? titles.get(revisionId) : "") || "";
  if (!documentTitle) return cite;
  return { ...record, documentTitle };
}

/** Desk files whose page chips can name the document that owns each revision. */
export function deskPackFilesFromPacket(packet: {
  chapters?: Parameters<typeof deskPackFiles>[0];
  appendices?: Parameters<typeof deskPackFiles>[0];
  changes?: Parameters<typeof documentTitlesFromChanges>[0];
} | null | undefined) {
  const titles = documentTitlesFromChanges(packet?.changes);
  const files = (input: Parameters<typeof deskPackFiles>[0]) => deskPackFiles((input ?? []).map((file) => ({
    ...file,
    pageCites: (file.pageCites ?? []).map((cite) => attachUnknownCiteTitle(cite, titles)),
  })));
  return {
    chapters: files(packet?.chapters),
    appendices: files(packet?.appendices),
  };
}

/** Pinned numeric cites use packPageCiteLabel. Sheet labels and unpinned rows do not. */
export function appendixCiteVisible(cite: AppendixPageCite): { status: "Pinned" | "Unpinned"; text: string; reason: string | null } {
  if (isUnpinnedAppendixCite(cite)) {
    return { status: "Unpinned", text: cite.display, reason: cite.reason };
  }
  if (!INTEGER_PAGE.test(cite.page)) {
    return { status: "Unpinned", text: sheetCiteDisplay(cite.page), reason: SHEET_NOT_MATCHED };
  }
  const titled = citePinStatus({
    documentTitle: cite.documentTitle,
    revisionLabel: cite.revisionLabel,
    revisionId: cite.revisionId,
    page: cite.page,
  });
  if (titled === "Pinned") return { status: "Pinned", text: packPageCiteLabel(cite), reason: null };
  const revision = displayRevision(cite.revisionLabel) ?? cite.revisionLabel;
  return { status: "Pinned", text: `${revision} · p. ${cite.page}`, reason: null };
}

export function storedPageCiteStrings(cites: readonly unknown[]): string[] | null {
  const rows = cites.map((cite) => canonicalAppendixPageCite(cite));
  if (rows.length === 0 || rows.some((cite) => cite === null)) return null;
  return rows.map((cite) => JSON.stringify(cite));
}

export function readStoredPageCites(raw: readonly string[]): AppendixPageCite[] | null {
  const cites: AppendixPageCite[] = [];
  for (const value of raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    const cite = canonicalAppendixPageCite(parsed);
    if (!cite) return null;
    cites.push(cite);
  }
  return cites;
}

export function legacyPageCiteMessage(pages: readonly string[]) {
  return `${LEGACY_PAGE_CITE_MESSAGE} Pages: ${pages.join(", ")}.`;
}

export function isLegacyPageCiteError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith(LEGACY_PAGE_CITE_MESSAGE);
}

/** Bare page strings stored before cites were pinned to a DocumentRevision. */
export function legacyBarePageTokens(values: readonly unknown[]): string[] | null {
  if (values.length === 0) return null;
  const pages: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !isPageToken(value)) return null;
    if (value.startsWith("{") || value.startsWith("[")) return null;
    pages.push(value);
  }
  return pages;
}

/** JSON pins for a legacy row. Returns null when the row is not entirely bare page strings. */
export function pinLegacyPageCites(
  raw: readonly string[],
  pin: { revisionId: string; revisionLabel: string; documentPageId?: string | null; contentHash?: string | null },
): string[] | null {
  const pages = legacyBarePageTokens(raw);
  if (!pages) return null;
  const pinned = pages.map((page) => canonicalPackPageCite({
    revisionId: pin.revisionId,
    revisionLabel: pin.revisionLabel,
    page,
    documentPageId: pin.documentPageId ?? null,
    contentHash: pin.contentHash ?? null,
  }));
  if (pinned.some((cite) => cite === null)) return null;
  return pinned.map((cite) => JSON.stringify(cite));
}

export function replacementPageCites(existingRaw: readonly string[], next: readonly unknown[]): string[] | null {
  if (!legacyBarePageTokens(existingRaw)) return null;
  return storedPageCiteStrings(next);
}

/** Bare appendix page strings inside a stored pack payload. Null when the cites are pinned or not page tokens. */
export function legacyAppendixPages(value: unknown): string[] | null {
  if (!value || typeof value !== "object") return null;
  const appendices = (value as { appendices?: unknown }).appendices;
  if (!Array.isArray(appendices) || appendices.length === 0) return null;
  const pages: string[] = [];
  for (const appendix of appendices) {
    if (!appendix || typeof appendix !== "object") return null;
    const cites = (appendix as { pageCites?: unknown }).pageCites;
    if (!Array.isArray(cites)) return null;
    const bare = legacyBarePageTokens(cites);
    if (bare) {
      pages.push(...bare);
      continue;
    }
    if (cites.every((cite) => canonicalAppendixPageCite(cite) !== null)) continue;
    return null;
  }
  return pages.length > 0 ? pages : null;
}

function markupLabels(filePages: readonly string[]) {
  const labels: string[] = [];
  const seenLabels = new Set<string>();
  for (const raw of filePages) {
    const page = raw.trim();
    const key = page.toLowerCase();
    if (!page || seenLabels.has(key) || isLettingNotice(page) || !isPageToken(page)) continue;
    seenLabels.add(key);
    labels.push(page);
  }
  return labels;
}

function markupRevisions(facts: readonly PackPageCite[], provided?: readonly MarkupRevisionPages[]): MarkupRevisionPages[] {
  const order: string[] = [];
  const known = new Map<string, { revisionLabel: string; contentHash: string | null }>();
  for (const cite of facts) {
    if (known.has(cite.revisionId)) continue;
    order.push(cite.revisionId);
    known.set(cite.revisionId, { revisionLabel: cite.revisionLabel, contentHash: cite.contentHash });
  }
  const byId = new Map((provided ?? []).map((revision) => [revision.revisionId, revision]));
  return order.map((revisionId) => {
    const fact = known.get(revisionId)!;
    const revision = byId.get(revisionId);
    if (!revision) {
      return { revisionId, revisionLabel: fact.revisionLabel, contentHash: fact.contentHash, pages: [] };
    }
    return {
      revisionId: revision.revisionId,
      revisionLabel: revision.revisionLabel || fact.revisionLabel,
      contentHash: revision.contentHash ?? fact.contentHash,
      pages: revision.pages,
    };
  });
}

function resolveMarkupLabel(label: string, revisions: readonly MarkupRevisionPages[]): AppendixPageCite {
  const pageNumber = integerPage(label);
  if (pageNumber === null) return resolveSheetLabel(label, revisions);
  const matches = revisions.flatMap((revision) => {
    const page = pageOnRevision(revision, pageNumber);
    return page ? [{ revision, page }] : [];
  });
  if (matches.length === 1) return pinMarkupPage(matches[0]!.revision, matches[0]!.page);
  if (matches.length === 0) return unpinnedMarkup(label, pageNotInReason(revisions), soleRevision(revisions));
  return unpinnedMarkup(label, PAGE_NOT_MATCHED, null);
}

function resolveSheetLabel(label: string, revisions: readonly MarkupRevisionPages[]): AppendixPageCite {
  const matches = revisions.flatMap((revision) => revision.pages.flatMap((page) => {
    const sheet = page.sheetNumber?.trim();
    if (!sheet || sheet.toLowerCase() !== label.toLowerCase()) return [];
    if (!pageOnRevision(revision, page.pageNumber)) return [];
    return [{ revision, page }];
  }));
  if (matches.length === 1) return pinMarkupPage(matches[0]!.revision, matches[0]!.page);
  return unpinnedMarkup(label, SHEET_NOT_MATCHED, soleRevision(revisions));
}

function pinMarkupPage(revision: MarkupRevisionPages, page: MarkupRevisionPage): AppendixPageCite {
  const cite = canonicalPackPageCite({
    revisionId: revision.revisionId,
    revisionLabel: revision.revisionLabel,
    page: String(page.pageNumber),
    documentPageId: page.id,
    contentHash: revision.contentHash,
  });
  if (!cite) return unpinnedMarkup(String(page.pageNumber), pageNotInReason([revision]), revision);
  return cite;
}

function pageOnRevision(revision: MarkupRevisionPages, pageNumber: number) {
  if (pageNumber < 1 || pageNumber > revision.pages.length) return null;
  return revision.pages.find((page) => page.pageNumber === pageNumber) ?? null;
}

function integerPage(label: string) {
  if (!INTEGER_PAGE.test(label)) return null;
  const value = Number(label);
  return Number.isSafeInteger(value) ? value : null;
}

function pageNotInReason(revisions: readonly MarkupRevisionPages[]) {
  const labels = revisions
    .map((revision) => displayRevision(revision.revisionLabel))
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return "not in Rev";
  if (labels.length === 1) return `not in ${labels[0]}`;
  return `not in ${labels.join(" or ")}`;
}

function sheetCiteDisplay(label: string) {
  if (INTEGER_PAGE.test(label)) return `p. ${label}`;
  const bare = label.replace(/^sheet\s+/i, "").trim();
  return `Sheet ${bare || label}`;
}

function soleRevision(revisions: readonly MarkupRevisionPages[]) {
  return revisions.length === 1 ? revisions[0]! : null;
}

function unpinnedMarkup(
  label: string,
  reason: string,
  revision: MarkupRevisionPages | null,
): MarkupUnpinnedCite {
  return {
    status: "Unpinned",
    label,
    display: sheetCiteDisplay(label),
    reason,
    revisionId: revision?.revisionId ?? null,
    revisionLabel: revision?.revisionLabel ?? null,
  };
}

function canonicalUnpinnedCite(row: Partial<MarkupUnpinnedCite>): MarkupUnpinnedCite | null {
  if (typeof row.label !== "string" || !isPageToken(row.label)) return null;
  if (typeof row.reason !== "string" || !isSafeReason(row.reason)) return null;
  const revisionId = row.revisionId ?? null;
  const revisionLabel = row.revisionLabel ?? null;
  if (revisionId !== null && (typeof revisionId !== "string" || !isRevisionPin(revisionId))) return null;
  if (revisionLabel !== null && (typeof revisionLabel !== "string" || !isRevisionLabel(revisionLabel))) return null;
  return {
    status: "Unpinned",
    label: row.label,
    display: sheetCiteDisplay(row.label),
    reason: row.reason,
    revisionId,
    revisionLabel,
  };
}

function isSafeReason(value: string) {
  return value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f]/.test(value);
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
  pageCites: AppendixPageCite[];
  citeNotice?: string | null;
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
  return (files ?? []).map((file) => {
    const raw = file.pageCites ?? [];
    const pageCites: AppendixPageCite[] = [];
    for (const cite of raw) {
      const row = canonicalAppendixPageCite(cite);
      if (row) pageCites.push(citeKeepingDocumentTitle(row, cite));
    }
    const legacy = pageCites.length === 0 ? legacyBarePageTokens(raw) : null;
    return {
      title: file.title,
      sourceId: file.sourceId,
      fetchedAt: file.fetchedAt,
      contentHash: file.contentHash,
      pageCites,
      citeNotice: legacy ? legacyPageCiteMessage(legacy) : null,
    };
  });
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
    pageCites: file.pageCites.flatMap((cite): AppendixPageCite[] => {
      const row = canonicalAppendixPageCite(cite);
      return row ? [citeKeepingDocumentTitle(row, cite)] : [];
    }),
  };
}
