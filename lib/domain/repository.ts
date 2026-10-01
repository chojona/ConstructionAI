import type {
  DocumentDetail,
  DocumentRecord,
  ProjectDetail,
  ProjectRecord,
  ProjectSummary,
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
}
