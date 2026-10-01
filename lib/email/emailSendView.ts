export const DRAFT_EMAIL_ACTION = "Draft email";
export const DRAFT_EMAIL_TITLE = "Draft email with approved pack";
export const PACK_MISSING_MESSAGE = "Export or build pack first";
export const SEND_RECORDED_MESSAGE = "Send recorded.";
export const DRAFT_SAVED_MESSAGE = "Draft saved.";
export const ALREADY_RECORDED_MESSAGE = "This send is already recorded.";
export const LEDGER_LINK_LABEL = "Open ledger row";
export const EMAIL_LEDGER_TITLE = "Email send ledger";
export const HUMAN_SEND_RECORDED = "Human send recorded.";
export const APPROVED_CHIP = "Approved";
export const ATTACHMENTS_LABEL = "Approved pack";
export const DOWNLOAD_PACK_LABEL = "Download approved pack";
export const BACK_TO_CHANGES = "Back to changes";
export const RECIPIENT_REQUIRED = "Enter at least one recipient.";
export const SUBJECT_REQUIRED = "Enter a subject.";
export const BODY_REQUIRED = "Enter a message.";
export const ACTOR_REQUIRED = "Enter your name before sending.";

export const EMAIL_FIELD_LABELS = {
  to: "To",
  subject: "Subject",
  body: "Body",
  pack: "Approved pack",
  documents: "Documents",
  decisions: "Decisions",
  sender: "Sender",
  drafted: "Drafted",
  sent: "Sent",
} as const;

const BANNED_EMAIL_COPY = /\b(cold outreach|auto-send|autosend|claim filing|entitlement|candidate|dsc|pco|change orders?|force account|force-account|delivered|inbox)\b/i;

export interface EmailAttachmentPreview {
  summary: string;
  documentId: string;
  documentTitle: string;
  decisionId: string;
  evidence: Array<{ pageNumber: number; excerpt: string }>;
}

export interface EmailSendView {
  id: string;
  status: "DRAFT" | "SENT";
  recipients: string[];
  subject: string;
  body: string;
  actorId: string;
  exportPacketId: string;
  documentIds: string[];
  reviewDecisionIds: string[];
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  ledgerPath: string;
}

export interface EmailDraftReady {
  ready: true;
  exportPacketId: string;
  subject: string;
  body: string;
  attachments: EmailAttachmentPreview[];
  draft: EmailSendView | null;
}

export interface EmailDraftBlocked {
  ready: false;
  message: string;
}

export type EmailDraftSource = EmailDraftReady | EmailDraftBlocked;

export function draftEmailVisible(approvedCount: number) {
  return approvedCount >= 1;
}

export function defaultEmailSubject(projectName: string) {
  return `${projectName.trim()} — approved facts pack`;
}

export function defaultEmailBody(projectName: string) {
  const name = projectName.trim();
  return [
    `Approved changes for ${name} are attached as the approved facts pack.`,
    "The pack lists each accepted change and the page it cites.",
  ].join("\n");
}

export function emailStatusLabel(status: "DRAFT" | "SENT") {
  return status === "SENT" ? "Sent" : "Draft";
}

export function emailLedgerPath(projectId: string, emailSendId: string) {
  return `/projects/${encodeURIComponent(projectId)}/emails/${encodeURIComponent(emailSendId)}`;
}

export function storedExportPacketPath(projectId: string, exportPacketId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/export-packets/${encodeURIComponent(exportPacketId)}`;
}

export function emailCopyIsAllowed(copy: string) {
  return !BANNED_EMAIL_COPY.test(copy);
}

export const EMAIL_SURFACE_COPY = [
  DRAFT_EMAIL_ACTION,
  DRAFT_EMAIL_TITLE,
  PACK_MISSING_MESSAGE,
  SEND_RECORDED_MESSAGE,
  DRAFT_SAVED_MESSAGE,
  ALREADY_RECORDED_MESSAGE,
  LEDGER_LINK_LABEL,
  EMAIL_LEDGER_TITLE,
  HUMAN_SEND_RECORDED,
  APPROVED_CHIP,
  ATTACHMENTS_LABEL,
  DOWNLOAD_PACK_LABEL,
  BACK_TO_CHANGES,
  RECIPIENT_REQUIRED,
  SUBJECT_REQUIRED,
  BODY_REQUIRED,
  ACTOR_REQUIRED,
  ...Object.values(EMAIL_FIELD_LABELS),
];
