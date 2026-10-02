import { createHash } from "node:crypto";
import { DomainError } from "@/lib/domain/errors";
import type { ProjectRevisionContext, ReviewDecisionRecord, RevisionChangeType } from "@/lib/domain/types";
import type { FindingEvidence, ProjectFinding } from "./findings";
import {
  ACC_EXPORT_CHAPTER_TITLE,
  BLUEBEAM_APPENDIX_ROLE,
  BLUEBEAM_MARKUP_APPENDIX_TITLE,
  EXPORT_BLOCKED_MESSAGE,
  LETTING_NOTICE_NOT_EVIDENCE,
  PACK_CITE_UNPINNED_MESSAGE,
  canonicalPackPageCite,
  isLettingNotice,
  isPinnedEvidenceCite,
  legacyAppendixPages,
  legacyPageCiteMessage,
  RFI_PDF_CHAPTER_TITLE,
  type AccChapterRole,
  type ApprovedChangePreview,
  type PackPageCite,
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
    revisionId: string;
    revisionLabel: string;
    contentHash: string | null;
    documentPageId: string | null;
    pageNumber: number;
    excerpt: string;
    startOffset: number;
    endOffset: number;
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

/** Bluebeam Markup Summary on an approved pack. Raw bytes stay in object storage. */
export interface ExportPacketAppendix {
  role: typeof BLUEBEAM_APPENDIX_ROLE;
  title: typeof BLUEBEAM_MARKUP_APPENDIX_TITLE;
  sourceId: string;
  fetchedAt: string;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
  pageCites: PackPageCite[];
}

export interface ExportPacketCanonical {
  kind: typeof APPROVED_CHANGE_PACKET_KIND;
  version: typeof APPROVED_CHANGE_PACKET_VERSION;
  projectId: string;
  note: typeof APPROVED_CHANGE_PACKET_NOTE;
  decisionIds: string[];
  changes: ApprovedChangePacketItem[];
  chapters?: ExportPacketChapter[];
  appendices?: ExportPacketAppendix[];
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
    appendices?: ExportPacketAppendix[];
  } = {
    kind: packet.kind,
    version: packet.version,
    projectId: packet.projectId,
    note: packet.note,
    decisionIds: packet.decisionIds,
    changes: packet.changes,
  };
  const chapters = canonicalChapters(packet.chapters ?? []);
  const appendices = canonicalAppendices(packet.appendices ?? []);
  if (chapters.length > 0) body.chapters = chapters;
  if (appendices.length > 0) body.appendices = appendices;
  return Buffer.from(JSON.stringify(body));
}

// Packet content hash: sha256 of canonicalPacketBytes.
// Covered: kind, version, projectId, note, decisionIds, approved changes, chapters, and appendices.
// Chapter and appendix file bytes are covered by each item's sha256 contentHash; raw files stay in object storage.
// Chapters and appendices are sorted and de-duplicated first, so the same inputs always hash the same.
// generatedAt and the packet id are outside the hash.
// Re-export returns this frozen snapshot. A later chapter or appendix attach stores a new packet and does not rewrite the hash.
export function packetContentHash(packet: ExportPacketCanonical) {
  return createHash("sha256").update(canonicalPacketBytes(packet)).digest("hex");
}

export function packetWithChapter(packet: ExportPacketCanonical, chapter: ExportPacketChapter): ExportPacketCanonical {
  return {
    kind: packet.kind,
    version: packet.version,
    projectId: packet.projectId,
    note: packet.note,
    decisionIds: packet.decisionIds,
    changes: packet.changes,
    chapters: [...(packet.chapters ?? []), chapter],
    ...(packet.appendices?.length ? { appendices: packet.appendices } : {}),
  };
}

export function packetWithAppendix(packet: ExportPacketCanonical, appendix: ExportPacketAppendix): ExportPacketCanonical {
  return {
    kind: packet.kind,
    version: packet.version,
    projectId: packet.projectId,
    note: packet.note,
    decisionIds: packet.decisionIds,
    changes: packet.changes,
    ...(packet.chapters?.length ? { chapters: packet.chapters } : {}),
    appendices: [...(packet.appendices ?? []), appendix],
  };
}

export function exportPacketStorageKey(projectId: string, contentHash: string) {
  return `export-packets/${projectId}/${contentHash}.json`;
}

export function accChapterStorageKey(projectId: string, contentHash: string) {
  return `export-packets/${projectId}/chapters/${contentHash}.pdf`;
}

export function appendixStorageKey(projectId: string, contentHash: string, extension: "pdf" | "csv") {
  return `export-packets/${projectId}/appendices/${contentHash}.${extension}`;
}

export function packetFromStored(stored: { contentHash: string; payload: Uint8Array; createdAt: Date }): ApprovedChangePacket {
  const payload = Buffer.from(stored.payload);
  const parsed: unknown = JSON.parse(payload.toString("utf8"));
  if (!isCanonicalPacket(parsed)) {
    const legacyPages = legacyAppendixPages(parsed);
    if (legacyPages) {
      throw new DomainError("MALFORMED_OUTPUT", legacyPageCiteMessage(legacyPages), 409);
    }
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
    && packet.changes.every(changeEvidenceIsPinned)
    && (packet.chapters === undefined || (Array.isArray(packet.chapters) && packet.chapters.every(isChapter)))
    && (packet.appendices === undefined || (Array.isArray(packet.appendices) && packet.appendices.every(isAppendix)));
}

function changeEvidenceIsPinned(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const change = value as { evidence?: unknown; document?: { title?: unknown } };
  if (typeof change.document?.title === "string" && isLettingNotice(change.document.title)) return false;
  return Array.isArray(change.evidence) && change.evidence.every(isPinnedEvidenceCite);
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

function isAppendix(value: unknown): value is ExportPacketAppendix {
  if (!value || typeof value !== "object") return false;
  const appendix = value as Partial<ExportPacketAppendix>;
  return appendix.role === BLUEBEAM_APPENDIX_ROLE
    && appendix.title === BLUEBEAM_MARKUP_APPENDIX_TITLE
    && typeof appendix.sourceId === "string"
    && appendix.sourceId.length > 0
    && typeof appendix.fetchedAt === "string"
    && typeof appendix.contentHash === "string"
    && /^[a-f0-9]{64}$/.test(appendix.contentHash)
    && typeof appendix.storageKey === "string"
    && appendix.storageKey.length > 0
    && typeof appendix.filename === "string"
    && appendix.filename.length > 0
    && typeof appendix.byteSize === "number"
    && Number.isInteger(appendix.byteSize)
    && appendix.byteSize >= 0
    && Array.isArray(appendix.pageCites)
    && appendix.pageCites.length > 0
    && appendix.pageCites.every((cite) => canonicalPackPageCite(cite) !== null);
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

function canonicalAppendix(appendix: ExportPacketAppendix): ExportPacketAppendix {
  const pageCites = appendix.pageCites.flatMap((cite) => {
    const pinned = canonicalPackPageCite(cite);
    return pinned ? [pinned] : [];
  });
  if (pageCites.length === 0 || pageCites.length !== appendix.pageCites.length) {
    throw new DomainError("INVALID_INPUT", PACK_CITE_UNPINNED_MESSAGE, 400);
  }
  return {
    role: BLUEBEAM_APPENDIX_ROLE,
    title: BLUEBEAM_MARKUP_APPENDIX_TITLE,
    sourceId: appendix.sourceId,
    fetchedAt: appendix.fetchedAt,
    contentHash: appendix.contentHash,
    storageKey: appendix.storageKey,
    filename: appendix.filename,
    byteSize: appendix.byteSize,
    pageCites,
  };
}

export function buildApprovedChangePacket(input: {
  projectId: string;
  findings: readonly ProjectFinding[];
  revisions: readonly ProjectRevisionContext[];
  subjectKey?: string;
  chapters?: readonly ExportPacketChapter[];
  appendices?: readonly ExportPacketAppendix[];
}): ExportPacketCanonical {
  const changes = selectApprovedFindings(input.findings, input.subjectKey).map((finding) => toPacketItem(finding, input.revisions));
  const chapters = canonicalChapters(input.chapters ?? []);
  const appendices = canonicalAppendices(input.appendices ?? []);
  return {
    kind: APPROVED_CHANGE_PACKET_KIND,
    version: APPROVED_CHANGE_PACKET_VERSION,
    projectId: input.projectId,
    note: APPROVED_CHANGE_PACKET_NOTE,
    decisionIds: changes.map((change) => change.decisionId),
    changes,
    ...(chapters.length > 0 ? { chapters } : {}),
    ...(appendices.length > 0 ? { appendices } : {}),
  };
}

export function packetChapterFromStored(row: {
  role: string;
  title: string;
  sourceId: string;
  fetchedAt: Date;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
}): ExportPacketChapter {
  const role: AccChapterRole | null = row.role === "rfi" || row.role === "acc-docs" ? row.role : null;
  const title = role === "rfi" ? RFI_PDF_CHAPTER_TITLE : role === "acc-docs" ? ACC_EXPORT_CHAPTER_TITLE : null;
  if (!role || title === null || row.title !== title || !/^[a-f0-9]{64}$/.test(row.contentHash) || !row.sourceId) {
    throw new DomainError("MALFORMED_OUTPUT", "Stored pack chapter could not be read.", 500);
  }
  return canonicalChapter({
    role,
    title,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt.toISOString(),
    contentHash: row.contentHash,
    storageKey: row.storageKey,
    filename: row.filename,
    byteSize: row.byteSize,
  });
}

export function packetAppendixFromStored(row: {
  role: string;
  title: string;
  sourceId: string;
  fetchedAt: Date;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
  pageCites: readonly PackPageCite[];
}): ExportPacketAppendix {
  const pageCites = row.pageCites.map((cite) => canonicalPackPageCite(cite));
  if (pageCites.some((cite) => cite === null)) {
    throw new DomainError("MALFORMED_OUTPUT", "Stored pack appendix could not be read.", 500);
  }
  const appendix: ExportPacketAppendix = {
    role: BLUEBEAM_APPENDIX_ROLE,
    title: BLUEBEAM_MARKUP_APPENDIX_TITLE,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt.toISOString(),
    contentHash: row.contentHash,
    storageKey: row.storageKey,
    filename: row.filename,
    byteSize: row.byteSize,
    pageCites: pageCites.filter((cite): cite is PackPageCite => cite !== null),
  };
  if (row.role !== BLUEBEAM_APPENDIX_ROLE || row.title !== BLUEBEAM_MARKUP_APPENDIX_TITLE || !isAppendix(appendix)) {
    throw new DomainError("MALFORMED_OUTPUT", "Stored pack appendix could not be read.", 500);
  }
  return canonicalAppendix(appendix);
}

function canonicalChapters(chapters: readonly ExportPacketChapter[]) {
  return dedupeAttachments([...chapters]
    .map(canonicalChapter)
    .sort((left, right) => (
      left.role.localeCompare(right.role)
      || left.sourceId.localeCompare(right.sourceId)
      || left.contentHash.localeCompare(right.contentHash)
      || left.fetchedAt.localeCompare(right.fetchedAt)
    )), (chapter) => `${chapter.role}\0${chapter.sourceId}\0${chapter.contentHash}`);
}

function canonicalAppendices(appendices: readonly ExportPacketAppendix[]) {
  return dedupeAttachments([...appendices]
    .map(canonicalAppendix)
    .sort((left, right) => (
      left.sourceId.localeCompare(right.sourceId)
      || left.contentHash.localeCompare(right.contentHash)
      || left.fetchedAt.localeCompare(right.fetchedAt)
    )), (appendix) => `${appendix.role}\0${appendix.sourceId}\0${appendix.contentHash}`);
}

function dedupeAttachments<T>(items: readonly T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
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
    evidence: citedEvidence(finding).map((item) => packetEvidence(item, revisions)),
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
  if (isLettingNotice(revision.documentTitle)) throw new DomainError("INVALID_INPUT", LETTING_NOTICE_NOT_EVIDENCE, 400);
  return { id: revision.documentId, title: revision.documentTitle };
}

function packetEvidence(item: FindingEvidence, revisions: readonly ProjectRevisionContext[]) {
  const revision = revisions.find((candidate) => candidate.id === item.revisionId);
  const contentHash = revision?.sha256 && /^[a-f0-9]{64}$/.test(revision.sha256) ? revision.sha256 : null;
  const cite = {
    revisionId: item.revisionId,
    revisionLabel: item.revisionLabel,
    contentHash,
    documentPageId: item.documentPageId,
    pageNumber: item.pageNumber,
    excerpt: item.excerpt,
    startOffset: item.startOffset,
    endOffset: item.endOffset,
  };
  if (!isPinnedEvidenceCite(cite)) throw new DomainError("INVALID_INPUT", PACK_CITE_UNPINNED_MESSAGE, 400);
  return cite;
}

function pageChips(finding: ProjectFinding) {
  const chips: ApprovedChangePreview["evidence"] = [];
  const seen = new Set<string>();
  for (const item of citedEvidence(finding)) {
    const key = `${item.revisionId}:${item.pageNumber}:${item.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({
      revisionId: item.revisionId,
      revisionLabel: item.revisionLabel,
      pageNumber: item.pageNumber,
      excerpt: item.excerpt,
      documentPageId: item.documentPageId,
    });
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
