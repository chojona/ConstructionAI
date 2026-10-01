import type { EmailSendRecord } from "@/lib/domain/repository";
import { emailLedgerPath, type EmailSendView } from "./emailSendView";

export function toEmailSendView(record: EmailSendRecord): EmailSendView {
  return {
    id: record.id,
    status: record.status,
    recipients: [...record.recipients],
    subject: record.subject,
    body: record.body,
    actorId: record.actorId,
    exportPacketId: record.exportPacketId,
    documentIds: [...record.documentIds],
    reviewDecisionIds: [...record.reviewDecisionIds],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    sentAt: record.sentAt ? record.sentAt.toISOString() : null,
    ledgerPath: emailLedgerPath(record.projectId, record.id),
  };
}
