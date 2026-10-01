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
}
