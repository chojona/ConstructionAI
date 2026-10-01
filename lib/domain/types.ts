export type RevisionStatus = "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";

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
