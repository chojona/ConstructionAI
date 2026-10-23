import { DomainError } from "@/lib/domain/errors";
import type { DocumentDetail, ProjectDetail } from "@/lib/domain/types";

/** Caller identity this gate needs. OrgAccess satisfies it. */
export interface ProjectAccess {
  organizationId: string;
}

export interface ProjectAccessLookup {
  getProject(organizationId: string, projectId: string): Promise<ProjectDetail | null>;
}

export interface DocumentAccessLookup {
  getDocument(organizationId: string, documentId: string): Promise<DocumentDetail | null>;
}

export interface RevisionAccessLookup<Revision> {
  getRevision(organizationId: string, revisionId: string): Promise<Revision | null>;
}

const PROJECT_NOT_FOUND = "Project not found.";
const DOCUMENT_NOT_FOUND = "Document not found.";
const REVISION_NOT_FOUND = "Revision not found.";

/**
 * v1 project ownership lives only in Project.organizationId.
 * A missing id and another organization's id both throw 404 so the
 * response does not reveal that the row exists. This is the only
 * place a future ProjectGrant check would go. Do not add sharing here.
 */
export async function requireProjectAccess(
  access: ProjectAccess,
  projectId: string,
  repository: ProjectAccessLookup,
): Promise<ProjectDetail> {
  const project = await repository.getProject(access.organizationId, projectId);
  if (!project || project.organizationId !== access.organizationId) {
    throw new DomainError("NOT_FOUND", PROJECT_NOT_FOUND, 404);
  }
  return project;
}

/** Resolves the document's owning project and requires that organization. */
export async function requireDocumentAccess(
  access: ProjectAccess,
  documentId: string,
  repository: DocumentAccessLookup,
): Promise<DocumentDetail> {
  const document = await repository.getDocument(access.organizationId, documentId);
  if (!document) throw new DomainError("NOT_FOUND", DOCUMENT_NOT_FOUND, 404);
  return document;
}

/** Resolves the revision's owning project and requires that organization. */
export async function requireRevisionAccess<Revision>(
  access: ProjectAccess,
  revisionId: string,
  repository: RevisionAccessLookup<Revision>,
): Promise<Revision> {
  const revision = await repository.getRevision(access.organizationId, revisionId);
  if (!revision) throw new DomainError("NOT_FOUND", REVISION_NOT_FOUND, 404);
  return revision;
}
