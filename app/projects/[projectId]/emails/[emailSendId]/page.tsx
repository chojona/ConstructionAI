import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError } from "@/lib/domain/errors";
import { readEmailSend } from "@/lib/email/service";
import {
  ATTACHMENTS_LABEL,
  BACK_TO_CHANGES,
  DOWNLOAD_PACK_LABEL,
  EMAIL_FIELD_LABELS,
  EMAIL_LEDGER_TITLE,
  HUMAN_SEND_RECORDED,
  emailStatusLabel,
  storedExportPacketPath,
} from "@/lib/email/emailSendView";
import { authorizePage } from "@/lib/auth/pageAccess";

export const dynamic = "force-dynamic";

const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
}).format(new Date(value));

export default async function EmailSendLedgerPage({
  params,
}: {
  params: Promise<{ projectId: string; emailSendId: string }>;
}) {
  const { projectId, emailSendId } = await params;
  const { organizationId } = await authorizePage("read");
  let email;
  try {
    email = await readEmailSend(organizationId, projectId, emailSendId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const rows = [
    ["Status", email.status === "SENT" ? `${emailStatusLabel(email.status)} · ${HUMAN_SEND_RECORDED}` : emailStatusLabel(email.status)],
    [EMAIL_FIELD_LABELS.to, email.recipients.join(", ")],
    [EMAIL_FIELD_LABELS.subject, email.subject],
    [EMAIL_FIELD_LABELS.body, email.body],
    [EMAIL_FIELD_LABELS.pack, email.exportPacketId],
    [EMAIL_FIELD_LABELS.documents, email.documentIds.join(", ")],
    [EMAIL_FIELD_LABELS.decisions, email.reviewDecisionIds.join(", ")],
    [EMAIL_FIELD_LABELS.sender, email.actorId],
    [EMAIL_FIELD_LABELS.drafted, dateTime(email.createdAt)],
    ...(email.sentAt ? [[EMAIL_FIELD_LABELS.sent, dateTime(email.sentAt)] as const] : []),
  ];
  return (
    <main className="page">
      <p className="eyebrow">{EMAIL_LEDGER_TITLE}</p>
      <h1>{email.subject}</h1>
      <dl className="ledger">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>{ATTACHMENTS_LABEL}</dt>
          <dd><a href={storedExportPacketPath(projectId, email.exportPacketId)}>{DOWNLOAD_PACK_LABEL}</a></dd>
        </div>
      </dl>
      <Link className="return-link" href={`/projects/${projectId}?view=changes`}>{BACK_TO_CHANGES}</Link>
    </main>
  );
}
