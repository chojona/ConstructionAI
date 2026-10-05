import type { DocumentRegisterRecord, RevisionStatus } from "@/lib/domain/types";
import { documentRowMeta } from "./documentDesk";

/** Derived register status. This is not stored on Document or DocumentRevision. */
export const REGISTER_STATUSES = ["Current", "Processing", "Failed", "Superseded"] as const;

export type DocumentRegisterStatus = (typeof REGISTER_STATUSES)[number];

export type RegisterRevisionScope = "latest" | "all";

export interface RegisterQuery {
  type: string | null;
  status: DocumentRegisterStatus | null;
  revision: RegisterRevisionScope;
  query: string;
  documentId: string | null;
  revisionId: string | null;
}

export interface RegisterRevisionDto {
  id: string;
  revisionLabel: string;
  revisionOrder: number;
  revisionStatus: RevisionStatus;
  pageCount: number;
  updatedLabel: string;
}

export interface RegisterDocumentDto {
  id: string;
  title: string;
  documentType: string | null;
  openChangeCount: number;
  issuedLabel: string | null;
  revisions: RegisterRevisionDto[];
}

export interface RegisterRow {
  key: string;
  documentId: string;
  title: string;
  documentType: string | null;
  revisionId: string | null;
  revisionLabel: string | null;
  status: DocumentRegisterStatus | null;
  updatedLabel: string | null;
  isLatest: boolean;
}

export interface OpenChangeFinding {
  sources: readonly { revisionId: string }[];
  subject: {
    type: string;
    revisedRevisionId?: string | null;
  };
}

const issuedDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const STATUS_SET = new Set<string>(REGISTER_STATUSES);

/**
 * Latest processed revision → Current.
 * Latest PROCESSING or UPLOADED → Processing (still in flight; the register has no fifth label).
 * Latest FAILED → Failed.
 * Any non-latest revision row → Superseded.
 * A document with no revision has no status.
 */
export function documentRegisterStatus(
  isLatest: boolean,
  revisionStatus: RevisionStatus | null,
): DocumentRegisterStatus | null {
  if (!revisionStatus) return null;
  if (!isLatest) return "Superseded";
  if (revisionStatus === "PROCESSED") return "Current";
  if (revisionStatus === "FAILED") return "Failed";
  return "Processing";
}

export function registerStatusClass(status: DocumentRegisterStatus) {
  if (status === "Current") return "status-processed";
  if (status === "Failed") return "status-failed";
  if (status === "Superseded") return "status-muted";
  return "status-pending";
}

export function latestRevision<T extends { id: string; revisionOrder: number }>(revisions: readonly T[]): T | null {
  return revisions.reduce<T | null>((latest, revision) => {
    if (!latest || revision.revisionOrder > latest.revisionOrder) return revision;
    if (revision.revisionOrder === latest.revisionOrder && revision.id > latest.id) return revision;
    return latest;
  }, null);
}

/** Type filter values are the document types that exist. Missing types are omitted, never bucketed. */
export function documentTypeOptions(documents: readonly { documentType: string | null | undefined }[]): string[] {
  const values = new Set<string>();
  for (const document of documents) {
    const type = documentRowMeta(document.documentType);
    if (type) values.add(type);
  }
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function relativeRevisionTime(createdAt: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - createdAt.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "just now";
  if (elapsed < hour) {
    const minutes = Math.floor(elapsed / minute);
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  if (elapsed < day) {
    const hours = Math.floor(elapsed / hour);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(elapsed / day);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function formatIssuedRevision(createdAt: Date) {
  return `Latest revision issued ${issuedDate.format(createdAt)}`;
}

/** Open Changes whose evidence or revised revision belongs to this document. */
export function openChangesFromDocument(
  revisionIds: readonly string[],
  findings: readonly OpenChangeFinding[],
): number {
  const ids = new Set(revisionIds);
  return findings.filter((finding) => (
    finding.sources.some((source) => ids.has(source.revisionId))
    || (finding.subject.type === "revision_change"
      && Boolean(finding.subject.revisedRevisionId)
      && ids.has(finding.subject.revisedRevisionId ?? ""))
  )).length;
}

export function toRegisterDocument(
  document: DocumentRegisterRecord,
  findings: readonly OpenChangeFinding[],
  now: Date,
): RegisterDocumentDto {
  const latest = latestRevision(document.revisions);
  return {
    id: document.id,
    title: document.title,
    documentType: document.documentType,
    openChangeCount: openChangesFromDocument(document.revisions.map((revision) => revision.id), findings),
    issuedLabel: latest ? formatIssuedRevision(latest.createdAt) : null,
    revisions: document.revisions.map((revision) => ({
      id: revision.id,
      revisionLabel: revision.revisionLabel,
      revisionOrder: revision.revisionOrder,
      revisionStatus: revision.status,
      pageCount: revision.pageCount,
      updatedLabel: relativeRevisionTime(revision.createdAt, now),
    })),
  };
}

export function registerRows(
  documents: readonly RegisterDocumentDto[],
  revision: RegisterRevisionScope,
): RegisterRow[] {
  const rows: RegisterRow[] = [];
  for (const document of documents) {
    const latest = latestRevision(document.revisions);
    const visible = revision === "all" ? [...document.revisions].sort(newestFirst) : latest ? [latest] : [];
    if (!visible.length) {
      rows.push({
        key: document.id,
        documentId: document.id,
        title: document.title,
        documentType: document.documentType,
        revisionId: null,
        revisionLabel: null,
        status: null,
        updatedLabel: null,
        isLatest: true,
      });
      continue;
    }
    for (const item of visible) {
      const isLatest = latest?.id === item.id;
      rows.push({
        key: revision === "all" ? `${document.id}:${item.id}` : document.id,
        documentId: document.id,
        title: document.title,
        documentType: document.documentType,
        revisionId: item.id,
        revisionLabel: item.revisionLabel,
        status: documentRegisterStatus(isLatest, item.revisionStatus),
        updatedLabel: item.updatedLabel,
        isLatest,
      });
    }
  }
  return rows;
}

export function filterRegisterRows(
  rows: readonly RegisterRow[],
  filters: Pick<RegisterQuery, "type" | "status" | "query">,
): RegisterRow[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.type && documentRowMeta(row.documentType) !== filters.type) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (query && !row.title.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function parseRegisterQuery(params: Record<string, string | string[] | undefined>): RegisterQuery {
  const status = readTrimmed(params, "status");
  const revision = readTrimmed(params, "revision");
  return {
    type: readTrimmed(params, "type"),
    status: status && STATUS_SET.has(status) ? status as DocumentRegisterStatus : null,
    revision: revision === "all" ? "all" : "latest",
    query: readRaw(params, "q") ?? "",
    documentId: readTrimmed(params, "doc"),
    revisionId: readTrimmed(params, "rev"),
  };
}

export function registerQueryKey(query: RegisterQuery) {
  return [query.type ?? "", query.status ?? "", query.revision, query.query, query.documentId ?? "", query.revisionId ?? ""].join("\u0000");
}

/** Writes register filters onto the current query string and keeps unrelated params such as view. */
export function registerQueryString(current: URLSearchParams, query: RegisterQuery) {
  const next = new URLSearchParams(current);
  writeParam(next, "type", query.type);
  writeParam(next, "status", query.status);
  if (query.revision === "all") next.set("revision", "all");
  else next.delete("revision");
  writeParam(next, "q", query.query.trim() ? query.query : null);
  writeParam(next, "doc", query.documentId);
  writeParam(next, "rev", query.revisionId);
  return next.toString();
}

export function emptyRegisterQuery(): RegisterQuery {
  return { type: null, status: null, revision: "latest", query: "", documentId: null, revisionId: null };
}

function newestFirst(left: { revisionOrder: number; id: string }, right: { revisionOrder: number; id: string }) {
  return right.revisionOrder - left.revisionOrder || left.id.localeCompare(right.id);
}

function readRaw(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return text ?? null;
}

function readTrimmed(params: Record<string, string | string[] | undefined>, key: string) {
  const text = readRaw(params, key)?.trim() ?? "";
  return text || null;
}

function writeParam(params: URLSearchParams, key: string, value: string | null) {
  if (value) params.set(key, value);
  else params.delete(key);
}
