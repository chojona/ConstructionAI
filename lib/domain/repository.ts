import type {
  DocumentDetail,
  DocumentRecord,
  ExtractionRunRecord,
  ExtractionRunStatus,
  ProjectDetail,
  ProjectRecord,
  ProjectReviewSource,
  ProjectSummary,
  ProposedFactRecord,
  ProposedFactType,
  ReviewDecisionRecord,
  ReviewDecisionValue,
  ReviewSubjectKind,
  RevisionChangeType,
  RevisionDetail,
} from "./types";
import type { PackPageCite } from "@/lib/review/exportPacketView";

export interface CreateRevisionRecordInput {
  documentId: string;
  revisionLabel: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  status: "PROCESSED" | "FAILED";
  failureCode?: string;
  failureMessage?: string;
  pages: Array<{ pageNumber: number; text: string; textSha256: string }>;
}

export interface CreateExtractionRunInput {
  organizationId: string;
  documentRevisionId: string;
  extractorName: string;
  extractorVersion: string;
  provider: string;
  model: string;
}

export interface ExtractionRunTransitionInput {
  organizationId: string;
  extractionRunId: string;
  expectedStatus: ExtractionRunStatus;
  status: ExtractionRunStatus;
  startedAt?: Date;
  completedAt?: Date;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface FailOpenExtractionInput {
  organizationId: string;
  extractionRunId: string;
  completedAt: Date;
  failureCode: string;
  failureMessage: string | null;
}

export interface CommitProposedFactInput {
  factType: ProposedFactType;
  payload: Record<string, string | null>;
  evidence: Array<{
    documentPageId: string;
    pageNumber: number;
    excerpt: string;
    startOffset: number;
    endOffset: number;
  }>;
}

export interface CommitProposedFactsInput {
  organizationId: string;
  extractionRunId: string;
  expectedStatus: ExtractionRunStatus;
  completedAt: Date;
  facts: CommitProposedFactInput[];
}

export interface AppendReviewDecisionInput {
  organizationId: string;
  projectId: string;
  subjectKind: ReviewSubjectKind;
  subjectKey: string;
  decision: ReviewDecisionValue;
  reviewerId: string;
  reason: string | null;
  proposedFactId: string;
  beforeProposedFactId: string | null;
  afterProposedFactId: string | null;
  baseRevisionId: string | null;
  revisedRevisionId: string | null;
  changeType: RevisionChangeType | null;
  createdAt: Date;
}

export interface SaveExportPacketInput {
  organizationId: string;
  projectId: string;
  contentHash: string;
  storageKey: string;
  payload: Buffer;
  reviewDecisionIds: string[];
  createdAt: Date;
}

export type ExportPacketChapterRole = "acc-docs" | "rfi" | "bluebeam-markup";

export interface SaveExportPacketChapterInput {
  organizationId: string;
  projectId: string;
  role: ExportPacketChapterRole;
  title: string;
  sourceId: string;
  fetchedAt: Date;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
  pageCites?: readonly PackPageCite[];
  reviewDecisionIds: string[];
}

export interface StoredExportPacketChapter {
  id: string;
  projectId: string;
  role: ExportPacketChapterRole;
  title: string;
  sourceId: string;
  fetchedAt: Date;
  contentHash: string;
  storageKey: string;
  filename: string;
  byteSize: number;
  pageCites: PackPageCite[];
  reviewDecisionIds: string[];
}

export interface StoredExportPacket {
  id: string;
  projectId: string;
  contentHash: string;
  storageKey: string;
  payload: Buffer;
  byteSize: number;
  createdAt: Date;
  reviewDecisionIds: string[];
}

export type EmailSendStatus = "DRAFT" | "SENT";

export interface EmailSendRecord {
  id: string;
  projectId: string;
  exportPacketId: string;
  status: EmailSendStatus;
  recipients: string[];
  subject: string;
  body: string;
  actorId: string;
  documentIds: string[];
  reviewDecisionIds: string[];
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface CreateEmailSendInput {
  organizationId: string;
  projectId: string;
  exportPacketId: string;
  status: EmailSendStatus;
  recipients: string[];
  subject: string;
  body: string;
  actorId: string;
  documentIds: string[];
  reviewDecisionIds: string[];
  createdAt: Date;
  sentAt: Date | null;
}

export interface UpdateEmailDraftInput {
  organizationId: string;
  projectId: string;
  emailSendId: string;
  status: EmailSendStatus;
  recipients: string[];
  subject: string;
  body: string;
  actorId: string;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface ConstructionRepository {
  organizationExists(organizationId: string): Promise<boolean>;
  createProject(input: {
    organizationId: string;
    name: string;
    projectNumber?: string;
  }): Promise<ProjectRecord>;
  listProjects(organizationId: string): Promise<ProjectSummary[]>;
  getProject(organizationId: string, projectId: string): Promise<ProjectDetail | null>;
  createDocument(input: {
    organizationId: string;
    projectId: string;
    title: string;
    documentType?: string;
  }): Promise<DocumentRecord | null>;
  getDocument(organizationId: string, documentId: string): Promise<DocumentDetail | null>;
  getRevision(organizationId: string, revisionId: string): Promise<RevisionDetail | null>;
  findRevisionByHash(
    organizationId: string,
    documentId: string,
    sha256: string,
  ): Promise<{ id: string } | null>;
  createRevision(input: CreateRevisionRecordInput): Promise<RevisionDetail>;
  createExtractionRun(input: CreateExtractionRunInput): Promise<ExtractionRunRecord | null>;
  listExtractionRuns(organizationId: string, documentRevisionId: string): Promise<ExtractionRunRecord[] | null>;
  getExtractionRun(organizationId: string, extractionRunId: string): Promise<ExtractionRunRecord | null>;
  applyExtractionRunTransition(input: ExtractionRunTransitionInput): Promise<ExtractionRunRecord | null>;
  failOpenExtraction(input: FailOpenExtractionInput): Promise<ExtractionRunRecord | null>;
  commitProposedFacts(input: CommitProposedFactsInput): Promise<ExtractionRunRecord | null>;
  listProposedFacts(organizationId: string, extractionRunId: string): Promise<ProposedFactRecord[] | null>;
  getProjectReviewSource(organizationId: string, projectId: string): Promise<ProjectReviewSource | null>;
  listReviewDecisions(organizationId: string, projectId: string): Promise<ReviewDecisionRecord[] | null>;
  appendReviewDecision(input: AppendReviewDecisionInput): Promise<ReviewDecisionRecord | null>;
  saveExportPacket(input: SaveExportPacketInput): Promise<StoredExportPacket | null>;
  getExportPacketByContentHash(organizationId: string, projectId: string, contentHash: string): Promise<StoredExportPacket | null>;
  getExportPacketById(organizationId: string, projectId: string, exportPacketId: string): Promise<StoredExportPacket | null>;
  saveExportPacketChapter(input: SaveExportPacketChapterInput): Promise<StoredExportPacketChapter | null>;
  listExportPacketChapters(organizationId: string, projectId: string, reviewDecisionIds: string[]): Promise<StoredExportPacketChapter[] | null>;
  createEmailSend(input: CreateEmailSendInput): Promise<EmailSendRecord | null>;
  updateEmailDraft(input: UpdateEmailDraftInput): Promise<EmailSendRecord | null>;
  getEmailSend(organizationId: string, projectId: string, emailSendId: string): Promise<EmailSendRecord | null>;
  findLatestDraftEmailSend(organizationId: string, projectId: string, exportPacketId: string): Promise<EmailSendRecord | null>;
}
