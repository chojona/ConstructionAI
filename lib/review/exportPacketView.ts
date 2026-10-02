export const EXPORT_BLOCKED_MESSAGE = "Approve at least one change to export.";
export const EXPORT_OPEN_MESSAGE = "Finish open reviews before exporting.";
export const ADD_ACC_EXPORT_LABEL = "Add pack chapter";
export const ACC_CHAPTER_FILE_LABEL = "PDF";
export const ACC_CHAPTER_SOURCE_LABEL = "Source id";
export const ACC_CHAPTER_KIND_LABEL = "Pack chapter";
export const ACC_EXPORT_CHAPTER_TITLE = "ACC export";
export const RFI_PDF_CHAPTER_TITLE = "RFI PDF";
export const ACC_CHAPTER_ADDED_MESSAGE = "Pack chapter added.";

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
