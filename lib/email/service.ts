import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository, EmailSendStatus } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import { toEmailSendView } from "./dto";
import {
  ACTOR_REQUIRED,
  ALREADY_RECORDED_MESSAGE,
  BODY_REQUIRED,
  PACK_MISSING_MESSAGE,
  RECIPIENT_REQUIRED,
  SUBJECT_REQUIRED,
  defaultEmailBody,
  defaultEmailSubject,
  type EmailAppendixPreview,
  type EmailAttachmentPreview,
  type EmailPackFilePreview,
  type EmailDraftSource,
  type EmailSendView,
} from "./emailSendView";
import {
  packetContentHash,
  packetFromStored,
  type ApprovedChangePacket,
} from "@/lib/review/exportPacket";
import { EXPORT_BLOCKED_MESSAGE } from "@/lib/review/exportPacketView";
import { currentApprovedChangePacket } from "@/lib/review/service";

const MAX_RECIPIENTS = 20;

const emailSchema = z.object({
  recipients: z.string().trim().min(1, RECIPIENT_REQUIRED).max(1000),
  subject: z.string().trim().min(1, SUBJECT_REQUIRED).max(200),
  body: z.string().trim().min(1, BODY_REQUIRED).max(4000),
  actorId: z.string().trim().min(1, ACTOR_REQUIRED).max(120),
  exportPacketId: z.string().trim().min(1).max(200),
  status: z.enum(["DRAFT", "SENT"]),
});

export type Clock = () => Date;

export function parseRecipients(raw: string) {
  const recipients = raw.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
  if (recipients.length === 0) throw new DomainError("INVALID_INPUT", RECIPIENT_REQUIRED, 400);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new DomainError("INVALID_INPUT", `Enter at most ${MAX_RECIPIENTS} recipients.`, 400);
  }
  if (recipients.some((recipient) => recipient.length > 200)) {
    throw new DomainError("INVALID_INPUT", "A recipient is too long.", 400);
  }
  return recipients;
}

export async function getEmailDraftSource(
  organizationId: string,
  projectId: string,
  repository: ConstructionRepository = constructionRepository,
): Promise<EmailDraftSource> {
  const loaded = await loadCurrentPack(organizationId, projectId, repository);
  if (!loaded.ready) return loaded;
  const draft = await repository.findLatestDraftEmailSend(organizationId, projectId, loaded.stored.id);
  return {
    ready: true,
    exportPacketId: loaded.stored.id,
    subject: draft?.subject ?? defaultEmailSubject(loaded.projectName),
    body: draft?.body ?? defaultEmailBody(loaded.projectName),
    attachments: attachmentsFromPacket(loaded.packet),
    chapters: chaptersFromPacket(loaded.packet),
    appendices: appendicesFromPacket(loaded.packet),
    draft: draft ? toEmailSendView(draft) : null,
  };
}

export async function recordEmailSend(
  organizationId: string,
  projectId: string,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
  clock: Clock = () => new Date(),
): Promise<EmailSendView> {
  const prepared = await prepareEmail(organizationId, projectId, rawInput, repository);
  const now = clock();
  const created = await repository.createEmailSend({
    organizationId,
    projectId,
    exportPacketId: prepared.packetId,
    status: prepared.status,
    recipients: prepared.recipients,
    subject: prepared.subject,
    body: prepared.body,
    actorId: prepared.actorId,
    documentIds: prepared.documentIds,
    reviewDecisionIds: prepared.reviewDecisionIds,
    createdAt: now,
    sentAt: prepared.status === "SENT" ? now : null,
  });
  if (!created) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return toEmailSendView(created);
}

export async function updateEmailDraft(
  organizationId: string,
  projectId: string,
  emailSendId: string,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
  clock: Clock = () => new Date(),
): Promise<EmailSendView> {
  const existing = await repository.getEmailSend(organizationId, projectId, emailSendId);
  if (!existing) throw new DomainError("NOT_FOUND", "Email send not found.", 404);
  if (existing.status !== "DRAFT") throw new DomainError("INVALID_INPUT", ALREADY_RECORDED_MESSAGE, 400);
  const prepared = await prepareEmail(organizationId, projectId, rawInput, repository);
  if (existing.exportPacketId !== prepared.packetId) {
    throw new DomainError("INVALID_INPUT", PACK_MISSING_MESSAGE, 400);
  }
  const now = clock();
  const updated = await repository.updateEmailDraft({
    organizationId,
    projectId,
    emailSendId,
    status: prepared.status,
    recipients: prepared.recipients,
    subject: prepared.subject,
    body: prepared.body,
    actorId: prepared.actorId,
    updatedAt: now,
    sentAt: prepared.status === "SENT" ? now : null,
  });
  if (!updated) throw new DomainError("INVALID_INPUT", ALREADY_RECORDED_MESSAGE, 400);
  return toEmailSendView(updated);
}

export async function readEmailSend(
  organizationId: string,
  projectId: string,
  emailSendId: string,
  repository: ConstructionRepository = constructionRepository,
): Promise<EmailSendView> {
  const record = await repository.getEmailSend(organizationId, projectId, emailSendId);
  if (!record) throw new DomainError("NOT_FOUND", "Email send not found.", 404);
  return toEmailSendView(record);
}

async function prepareEmail(
  organizationId: string,
  projectId: string,
  rawInput: unknown,
  repository: ConstructionRepository,
) {
  const input = emailSchema.parse(rawInput);
  const recipients = parseRecipients(input.recipients);
  const loaded = await loadCurrentPack(organizationId, projectId, repository);
  if (!loaded.ready) throw new DomainError("INVALID_INPUT", loaded.message, 400);
  if (loaded.stored.id !== input.exportPacketId) {
    throw new DomainError("INVALID_INPUT", PACK_MISSING_MESSAGE, 400);
  }
  return {
    status: input.status as EmailSendStatus,
    recipients,
    subject: input.subject,
    body: input.body,
    actorId: input.actorId,
    packetId: loaded.stored.id,
    documentIds: documentIdsFromPacket(loaded.packet),
    reviewDecisionIds: [...loaded.packet.decisionIds],
  };
}

async function loadCurrentPack(
  organizationId: string,
  projectId: string,
  repository: ConstructionRepository,
) {
  const project = await repository.getProject(organizationId, projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  let packet;
  try {
    packet = await currentApprovedChangePacket(organizationId, projectId, repository);
  } catch (error) {
    if (error instanceof DomainError && error.message === EXPORT_BLOCKED_MESSAGE) {
      return { ready: false as const, message: EXPORT_BLOCKED_MESSAGE };
    }
    throw error;
  }
  const stored = await repository.getExportPacketByContentHash(organizationId, projectId, packetContentHash(packet));
  if (!stored) return { ready: false as const, message: PACK_MISSING_MESSAGE };
  return {
    ready: true as const,
    projectName: project.name,
    packet: packetFromStored(stored),
    stored,
  };
}

function attachmentsFromPacket(packet: ApprovedChangePacket): EmailAttachmentPreview[] {
  return packet.changes.filter((change) => change.decision === "ACCEPTED").map((change) => ({
    summary: change.summary,
    documentId: change.document.id,
    documentTitle: change.document.title,
    decisionId: change.decisionId,
    evidence: change.evidence.map((item) => ({ pageNumber: item.pageNumber, excerpt: item.excerpt })),
  }));
}

function chaptersFromPacket(packet: ApprovedChangePacket): EmailPackFilePreview[] {
  return (packet.chapters ?? []).map((chapter) => ({
    title: chapter.title,
    filename: chapter.filename,
    sourceId: chapter.sourceId,
    fetchedAt: chapter.fetchedAt,
    contentHash: chapter.contentHash,
    pageCites: [],
  }));
}

function appendicesFromPacket(packet: ApprovedChangePacket): EmailAppendixPreview[] {
  return (packet.appendices ?? []).map((appendix) => ({
    title: appendix.title,
    filename: appendix.filename,
    sourceId: appendix.sourceId,
    fetchedAt: appendix.fetchedAt,
    contentHash: appendix.contentHash,
    pageCites: [...appendix.pageCites],
  }));
}

function documentIdsFromPacket(packet: ApprovedChangePacket) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const change of packet.changes) {
    if (change.decision !== "ACCEPTED" || seen.has(change.document.id)) continue;
    seen.add(change.document.id);
    ids.push(change.document.id);
  }
  return ids;
}
