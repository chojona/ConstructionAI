import { createHash } from "node:crypto";
import { DomainError } from "@/lib/domain/errors";
import type { ProjectRevisionContext, ReviewDecisionRecord, RevisionChangeType } from "@/lib/domain/types";
import type { FindingEvidence, ProjectFinding } from "./findings";

export const EXPORT_BLOCKED_MESSAGE = "Approve at least one change to export.";
export const APPROVED_CHANGE_PACKET_KIND = "approved-change-packet";
export const APPROVED_CHANGE_PACKET_VERSION = 1;
export const APPROVED_CHANGE_PACKET_NOTE = "Approved changes with the cited page evidence.";

const NOT_EXPORTABLE = "Only an approved change can be exported.";

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

export interface ExportPacketCanonical {
  kind: typeof APPROVED_CHANGE_PACKET_KIND;
  version: typeof APPROVED_CHANGE_PACKET_VERSION;
  projectId: string;
  note: typeof APPROVED_CHANGE_PACKET_NOTE;
  decisionIds: string[];
  changes: ApprovedChangePacketItem[];
}

export interface ApprovedChangePacket extends ExportPacketCanonical {
  contentHash: string;
  generatedAt: string;
}

export function subjectExportVisible(decision: string | null | undefined) {
  return decision === "ACCEPTED";
}

export function exportPacketAction(approvedCount: number, projectId: string): ExportPacketAction {
  if (approvedCount < 1) return { enabled: false, href: null, message: EXPORT_BLOCKED_MESSAGE };
  return { enabled: true, href: approvedChangeExportPath(projectId), message: null };
}

export function approvedChangeExportPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/export`;
}

export function visiblePacketChanges<T extends { decision: string }>(changes: readonly T[]) {
  return changes.filter((change) => change.decision === "ACCEPTED");
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
  return Buffer.from(JSON.stringify({
    kind: packet.kind,
    version: packet.version,
    projectId: packet.projectId,
    note: packet.note,
    decisionIds: packet.decisionIds,
    changes: packet.changes,
  }));
}

export function packetContentHash(packet: ExportPacketCanonical) {
  return createHash("sha256").update(canonicalPacketBytes(packet)).digest("hex");
}

export function exportPacketStorageKey(projectId: string, contentHash: string) {
  return `export-packets/${projectId}/${contentHash}.json`;
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
    && Array.isArray(packet.changes);
}

export function buildApprovedChangePacket(input: {
  projectId: string;
  findings: readonly ProjectFinding[];
  revisions: readonly ProjectRevisionContext[];
  subjectKey?: string;
}): ExportPacketCanonical {
  const changes = selectApprovedFindings(input.findings, input.subjectKey).map((finding) => toPacketItem(finding, input.revisions));
  return {
    kind: APPROVED_CHANGE_PACKET_KIND,
    version: APPROVED_CHANGE_PACKET_VERSION,
    projectId: input.projectId,
    note: APPROVED_CHANGE_PACKET_NOTE,
    decisionIds: changes.map((change) => change.decisionId),
    changes,
  };
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
