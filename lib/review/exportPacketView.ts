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
    pageNumber: number;
    excerpt: string;
  }>;
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
  pageCites: string[];
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
  if (selected) return { subjectKey: "", pageCites: [] as string[] };
  if (changes.length === 1) {
    const change = changes[0]!;
    return { subjectKey: change.subjectKey, pageCites: factPageCites(change.evidence) };
  }
  return { subjectKey: "", pageCites: factPageCites(changes.flatMap((change) => change.evidence)) };
}

export function factPageCites(evidence: readonly { pageNumber: number }[]) {
  const cites: string[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!Number.isInteger(item.pageNumber) || item.pageNumber < 1) continue;
    const cite = String(item.pageNumber);
    if (seen.has(cite)) continue;
    seen.add(cite);
    cites.push(cite);
  }
  return cites;
}

export function shortContentSha256(contentHash: string) {
  return contentHash.slice(0, CONTENT_SHA256_SHORT_LENGTH);
}

export function deskPackFiles(files: readonly {
  title: string;
  sourceId: string;
  fetchedAt: string;
  contentHash: string;
  pageCites?: readonly string[];
}[] | undefined): DeskPackFile[] {
  return (files ?? []).map((file) => ({
    title: file.title,
    sourceId: file.sourceId,
    fetchedAt: file.fetchedAt,
    contentHash: file.contentHash,
    pageCites: [...(file.pageCites ?? [])],
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
    pageCites: file.pageCites,
  };
}
