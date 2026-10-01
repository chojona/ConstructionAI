export const EXPORT_BLOCKED_MESSAGE = "Approve at least one change to export.";

export interface ExportPacketAction {
  enabled: boolean;
  href: string | null;
  message: typeof EXPORT_BLOCKED_MESSAGE | null;
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

export function exportPacketAction(approvedCount: number, projectId: string): ExportPacketAction {
  if (approvedCount < 1) return { enabled: false, href: null, message: EXPORT_BLOCKED_MESSAGE };
  return { enabled: true, href: approvedChangeExportPath(projectId), message: null };
}

export function visiblePacketChanges<T extends { decision: string }>(changes: readonly T[]) {
  return changes.filter((change) => change.decision === "ACCEPTED");
}
