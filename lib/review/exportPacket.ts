import { createHash } from "node:crypto";
import { DomainError } from "@/lib/domain/errors";
import type { ProjectRevisionContext, ReviewDecisionRecord, RevisionChangeType } from "@/lib/domain/types";
import type { FindingEvidence, ProjectFinding } from "./findings";
import {
  ACC_EXPORT_CHAPTER_TITLE,
  EXPORT_BLOCKED_MESSAGE,
  RFI_PDF_CHAPTER_TITLE,
  type AccChapterRole,
  type ApprovedChangePreview,
} from "./exportPacketView";

export {
  ACC_CHAPTER_ADDED_MESSAGE,
  ACC_CHAPTER_FILE_LABEL,
  ACC_CHAPTER_KIND_LABEL,
  ACC_CHAPTER_SOURCE_LABEL,
  ACC_EXPORT_CHAPTER_TITLE,
  ADD_ACC_EXPORT_LABEL,
  EXPORT_BLOCKED_MESSAGE,
  RFI_PDF_CHAPTER_TITLE,
  accChapterAttachVisible,
  approvedChangeExportPath,
  exportPacketAction,
  subjectExportVisible,
  visiblePacketChanges,
  type AccChapterRole,
  type ApprovedChangePreview,
  type ExportPacketAction,
} from "./exportPacketView";

export const APPROVED_CHANGE_PACKET_KIND = "approved-change-packet";
export const APPROVED_CHANGE_PACKET_VERSION = 1;
export const APPROVED_CHANGE_PACKET_NOTE = "Approved changes with the cited page evidence.";

const NOT_EXPORTABLE = "Only an approved change can be exported.";

export interface ApprovedChangePacketItem {
  subjectKey: string;
  summary: string;
  decisionId: string;
  decision: "ACCEPTED";
  reviewerId: string;
  approvedAt: string;
  reason: string | null;
  proposedFactId: string;
  changeType: RevisionChangeType | null;
  document: { id: string; title: string };
  revisions: Array<{ id: string; label: string; role: ProjectFinding["sources"][number]["role"] }>;
  evidence: Array<{
    documentPageId: string | null;
    pageNumber: number;
    excerpt: string;
    startOffset: number;
    endOffset: number;
    revisionId: string;
  }>;
}

/** Supporting ACC Docs or RFI PDF on an approved pack. Raw bytes stay in object storage. */
export interface ExportPacketChapter {
  role: AccChapterRole;
  title: typeof ACC_EXPORT_CHAPTER_TITLE | typeof RFI_PDF_CHAPTER_TITLE;
  sourceId: string;
  fetchedAt: string;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
}

export interface ExportPacketCanonical {
  kind: typeof APPROVED_CHANGE_PACKET_KIND;
  version: typeof APPROVED_CHANGE_PACKET_VERSION;
  projectId: string;
  note: typeof APPROVED_CHANGE_PACKET_NOTE;
  decisionIds: string[];
  changes: ApprovedChangePacketItem[];
  chapters?: ExportPacketChapter[];
}

export interface ApprovedChangePacket extends ExportPacketCanonical {
  contentHash: string;
  generatedAt: string;
}

export function approvedChangePreview(findings: readonly ProjectFinding[]): ApprovedChangePreview[] {
  return findings.flatMap((finding) => {
    if (finding.currentDecision?.decision !== "ACCEPTED") return [];
    return [{
      subjectKey: finding.subjectKey,
      decision: "ACCEPTED" as const,
      summary: finding.label,
      evidence: pageChips(finding),
    }];
  });
}

export function canonicalPacketBytes(packet: ExportPacketCanonical) {
  const body: {
    kind: ExportPacketCanonical["kind"];
    version: ExportPacketCanonical["version"];
    projectId: string;
    note: ExportPacketCanonical["note"];
    decisionIds: string[];
    changes: ApprovedChangePacketItem[];
    chapters?: ExportPacketChapter[];
  } = {
    kind: packet.kind,
    version: packet.version,
    projectId: packet.projectId,
    note: packet.note,
    decisionIds: packet.decisionIds,
    changes: packet.changes,
  };
  if (packet.chapters && packet.chapters.length > 0) body.chapters = packet.chapters.map(canonicalChapter);
  return Buffer.from(JSON.stringify(body));
}

export function packetContentHash(packet: ExportPacketCanonical) {
  return createHash("sha256").update(canonicalPacketBytes(packet)).digest("hex");
}

export function exportPacketStorageKey(projectId: string, contentHash: string) {
  return `export-packets/${projectId}/${contentHash}.json`;
}

export function accChapterStorageKey(projectId: string, contentHash: string) {
  return `export-packets/${projectId}/chapters/${contentHash}.pdf`;
}

export function packetFromStored(stored: { contentHash: string; payload: Uint8Array; createdAt: Date }): ApprovedChangePacket {
  const payload = Buffer.from(stored.payload);
  const parsed: unknown = JSON.parse(payload.toString("utf8"));
  if (!isCanonicalPacket(parsed)) {
    throw new DomainError("MALFORMED_OUTPUT", "Stored export packet could not be read.", 500);
  }
  const contentHash = packetContentHash(parsed);
  if (contentHash !== stored.contentHash) {
    throw new DomainError("MALFORMED_OUTPUT", "Stored export packet does not match its content hash.", 500);
  }
  return { ...parsed, contentHash, generatedAt: stored.createdAt.toISOString() };
}

function isCanonicalPacket(value: unknown): value is ExportPacketCanonical {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<ExportPacketCanonical>;
  return packet.kind === APPROVED_CHANGE_PACKET_KIND
    && packet.version === APPROVED_CHANGE_PACKET_VERSION
    && typeof packet.projectId === "string"
    && packet.note === APPROVED_CHANGE_PACKET_NOTE
    && Array.isArray(packet.decisionIds)
    && Array.isArray(packet.changes)
    && (packet.chapters === undefined || (Array.isArray(packet.chapters) && packet.chapters.every(isChapter)));
}

function isChapter(value: unknown): value is ExportPacketChapter {
  if (!value || typeof value !== "object") return false;
  const chapter = value as Partial<ExportPacketChapter>;
  const title = chapter.role === "rfi" ? RFI_PDF_CHAPTER_TITLE : chapter.role === "acc-docs" ? ACC_EXPORT_CHAPTER_TITLE : null;
  return title !== null
    && chapter.title === title
    && typeof chapter.sourceId === "string"
    && chapter.sourceId.length > 0
    && typeof chapter.fetchedAt === "string"
    && typeof chapter.contentHash === "string"
    && /^[a-f0-9]{64}$/.test(chapter.contentHash)
    && typeof chapter.storageKey === "string"
    && chapter.storageKey.length > 0
    && typeof chapter.filename === "string"
    && chapter.filename.length > 0
    && typeof chapter.byteSize === "number"
    && Number.isInteger(chapter.byteSize)
    && chapter.byteSize >= 0;
}

function canonicalChapter(chapter: ExportPacketChapter): ExportPacketChapter {
  return {
    role: chapter.role,
    title: chapter.title,
    sourceId: chapter.sourceId,
    fetchedAt: chapter.fetchedAt,
    contentHash: chapter.contentHash,
    storageKey: chapter.storageKey,
    filename: chapter.filename,
    byteSize: chapter.byteSize,
  };
}

export function buildApprovedChangePacket(input: {
  projectId: string;
  findings: readonly ProjectFinding[];
  revisions: readonly ProjectRevisionContext[];
  subjectKey?: string;
  chapters?: readonly ExportPacketChapter[];
}): ExportPacketCanonical {
  const changes = selectApprovedFindings(input.findings, input.subjectKey).map((finding) => toPacketItem(finding, input.revisions));
  const chapters = canonicalChapters(input.chapters ?? []);
  return {
    kind: APPROVED_CHANGE_PACKET_KIND,
    version: APPROVED_CHANGE_PACKET_VERSION,
    projectId: input.projectId,
    note: APPROVED_CHANGE_PACKET_NOTE,
    decisionIds: changes.map((change) => change.decisionId),
    changes,
    ...(chapters.length > 0 ? { chapters } : {}),
  };
}

export function packetChapterFromStored(row: {
  role: AccChapterRole;
  title: string;
  sourceId: string;
  fetchedAt: Date;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
}): ExportPacketChapter {
  const title = row.role === "rfi" ? RFI_PDF_CHAPTER_TITLE : ACC_EXPORT_CHAPTER_TITLE;
  if (row.title !== title || !/^[a-f0-9]{64}$/.test(row.contentHash) || !row.sourceId) {
    throw new DomainError("MALFORMED_OUTPUT", "Stored pack chapter could not be read.", 500);
  }
  return canonicalChapter({
    role: row.role,
    title,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt.toISOString(),
    contentHash: row.contentHash,
    storageKey: row.storageKey,
    filename: row.filename,
    byteSize: row.byteSize,
  });
}

function canonicalChapters(chapters: readonly ExportPacketChapter[]) {
  return [...chapters]
    .map(canonicalChapter)
    .sort((left, right) => (
      left.role.localeCompare(right.role)
      || left.sourceId.localeCompare(right.sourceId)
      || left.contentHash.localeCompare(right.contentHash)
      || left.fetchedAt.localeCompare(right.fetchedAt)
    ));
}

export function selectApprovedFindings(findings: readonly ProjectFinding[], subjectKey?: string) {
  if (subjectKey) {
    const finding = findings.find((item) => item.subjectKey === subjectKey);
    if (!finding) throw new DomainError("NOT_FOUND", "Change not found.", 404);
    if (finding.currentDecision?.decision !== "ACCEPTED") {
      throw new DomainError("INVALID_INPUT", NOT_EXPORTABLE, 400);
    }
    return [finding];
  }
  const approved = findings.filter((finding) => finding.currentDecision?.decision === "ACCEPTED");
  if (approved.length === 0) throw new DomainError("INVALID_INPUT", EXPORT_BLOCKED_MESSAGE, 400);
  return approved;
}

function toPacketItem(finding: ProjectFinding, revisions: readonly ProjectRevisionContext[]): ApprovedChangePacketItem {
  const decision = acceptedDecision(finding);
  return {
    subjectKey: finding.subjectKey,
    summary: finding.label,
    decisionId: decision.id,
    decision: "ACCEPTED",
    reviewerId: decision.reviewerId,
    approvedAt: decision.createdAt.toISOString(),
    reason: decision.reason,
    proposedFactId: proposedFactIdOf(finding),
    changeType: finding.subject.type === "revision_change" ? finding.subject.changeType : null,
    document: documentFor(finding, revisions),
    revisions: finding.sources.map((source) => ({
      id: source.revisionId,
      label: source.revisionLabel,
      role: source.role,
    })),
    evidence: citedEvidence(finding).map((item) => ({
      documentPageId: item.documentPageId,
      pageNumber: item.pageNumber,
      excerpt: item.excerpt,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      revisionId: item.revisionId,
    })),
  };
}

function acceptedDecision(finding: ProjectFinding): ReviewDecisionRecord {
  const decision = finding.currentDecision;
  if (!decision || decision.decision !== "ACCEPTED") {
    throw new DomainError("INVALID_INPUT", NOT_EXPORTABLE, 400);
  }
  return decision;
}

function proposedFactIdOf(finding: ProjectFinding) {
  if (finding.subject.type === "proposed_fact") return finding.subject.proposedFactId;
  const id = finding.subject.afterProposedFactId ?? finding.subject.beforeProposedFactId;
  if (!id) throw new DomainError("INVALID_INPUT", "Approved change is missing its proposed fact.", 400);
  return id;
}

function documentFor(finding: ProjectFinding, revisions: readonly ProjectRevisionContext[]) {
  const preferred = finding.sources.find((source) => source.role === "current" || source.role === "extracted") ?? finding.sources[0];
  const revision = preferred ? revisions.find((item) => item.id === preferred.revisionId) : undefined;
  if (!revision) throw new DomainError("INVALID_INPUT", "Approved change is missing its document.", 400);
  return { id: revision.documentId, title: revision.documentTitle };
}

function pageChips(finding: ProjectFinding) {
  const chips: ApprovedChangePreview["evidence"] = [];
  const seen = new Set<string>();
  for (const item of citedEvidence(finding)) {
    const key = `${item.revisionId}:${item.pageNumber}:${item.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({ revisionId: item.revisionId, pageNumber: item.pageNumber, excerpt: item.excerpt });
  }
  return chips;
}

function citedEvidence(finding: ProjectFinding): FindingEvidence[] {
  const fromSides = [finding.before, finding.after].flatMap((side) => side?.evidence ?? []);
  const items = fromSides.length > 0 ? fromSides : finding.evidence;
  const seen = new Set<string>();
  const unique: FindingEvidence[] = [];
  for (const item of items) {
    const key = `${item.revisionId}:${item.documentPageId ?? ""}:${item.pageNumber}:${item.startOffset}:${item.endOffset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
