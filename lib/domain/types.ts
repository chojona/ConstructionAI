export type RevisionStatus = "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";

export type ExtractionRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SUPERSEDED";

export interface ProjectRecord {
  id: string;
  organizationId: string;
  name: string;
  projectNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSummary extends ProjectRecord {
  documentCount: number;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  title: string;
  documentType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentSummary extends DocumentRecord {
  revisionCount: number;
}

export interface ProjectDetail extends ProjectRecord {
  documents: DocumentSummary[];
}

export interface RevisionPageRecord {
  id: string;
  documentRevisionId: string;
  pageNumber: number;
  text: string;
  textSha256: string | null;
  createdAt: Date;
}

export interface RevisionRecord {
  id: string;
  documentId: string;
  revisionLabel: string;
  revisionOrder: number;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  status: RevisionStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
}

export interface DocumentDetail extends DocumentRecord {
  project: Pick<ProjectRecord, "id" | "name">;
  revisions: RevisionRecord[];
}

export interface RevisionDetail extends RevisionRecord {
  document: DocumentRecord & { project: Pick<ProjectRecord, "id" | "name"> };
  pages: RevisionPageRecord[];
}

export interface ExtractionRunRecord {
  id: string;
  documentRevisionId: string;
  attemptNumber: number;
  extractorName: string;
  extractorVersion: string;
  provider: string;
  model: string;
  status: ExtractionRunStatus;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export type ProposedFactType = "equipment_requirement" | "schedule_date" | "quantity";

export interface ProposedFactEvidenceRecord {
  documentPageId: string;
  pageNumber: number;
  excerpt: string;
  startOffset: number;
  endOffset: number;
}

export interface ProposedFactRecord {
  id: string;
  extractionRunId: string;
  ordinal: number;
  factType: ProposedFactType;
  payload: Record<string, string | null>;
  evidence: ProposedFactEvidenceRecord[];
  createdAt: Date;
}

export type ReviewDecisionValue = "ACCEPTED" | "DISMISSED" | "FLAGGED";
export type ReviewSubjectKind = "PROPOSED_FACT" | "REVISION_CHANGE";
export type RevisionChangeType = "ADDED" | "REMOVED" | "MODIFIED";

export interface ReviewDecisionRecord {
  id: string;
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
  supersedesDecisionId: string | null;
  createdAt: Date;
}

export interface ProjectRevisionContext {
  id: string;
  documentId: string;
  documentTitle: string;
  revisionLabel: string;
  revisionOrder: number;
  /** sha256 of the stored revision bytes, when the repository loaded them. */
  sha256?: string;
}

export interface ProjectRunContext {
  id: string;
  documentRevisionId: string;
  attemptNumber: number;
  extractorName: string;
  extractorVersion: string;
  status: ExtractionRunStatus;
}

export interface ProjectFactContext extends ProposedFactRecord {
  documentRevisionId: string;
}

export interface ProjectReviewSource {
  projectId: string;
  revisions: ProjectRevisionContext[];
  runs: ProjectRunContext[];
  facts: ProjectFactContext[];
}
