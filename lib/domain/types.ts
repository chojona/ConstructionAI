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
