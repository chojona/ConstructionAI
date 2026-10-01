import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository, CreateRevisionRecordInput } from "@/lib/domain/repository";
import type {
  DocumentDetail,
  DocumentRecord,
  ProjectDetail,
  ProjectRecord,
  ProjectSummary,
  RevisionDetail,
  RevisionPageRecord,
  RevisionRecord,
} from "@/lib/domain/types";

export class MemoryRepository implements ConstructionRepository {
  readonly organizations = new Set<string>();
  readonly projects: ProjectRecord[] = [];
  readonly documents: DocumentRecord[] = [];
  readonly revisions: RevisionRecord[] = [];
  readonly pages: RevisionPageRecord[] = [];
  private sequence = 0;

  addOrganization(id: string) { this.organizations.add(id); }
  private id(prefix: string) { this.sequence += 1; return `${prefix}_${this.sequence}`; }
  private now() { return new Date(Date.UTC(2026, 8, 30, 12, 0, this.sequence)); }

  async organizationExists(organizationId: string) { return this.organizations.has(organizationId); }

  async createProject(input: { organizationId: string; name: string; projectNumber?: string }) {
    const project: ProjectRecord = {
      id: this.id("project"), organizationId: input.organizationId, name: input.name,
      projectNumber: input.projectNumber ?? null, createdAt: this.now(), updatedAt: this.now(),
    };
    this.projects.push(project);
    return project;
  }

  async listProjects(organizationId: string): Promise<ProjectSummary[]> {
    return this.projects.filter((item) => item.organizationId === organizationId).map((item) => ({
      ...item, documentCount: this.documents.filter((document) => document.projectId === item.id).length,
    }));
  }

  async getProject(organizationId: string, projectId: string): Promise<ProjectDetail | null> {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    return {
      ...project,
      documents: this.documents.filter((item) => item.projectId === project.id).map((document) => ({
        ...document,
        revisionCount: this.revisions.filter((revision) => revision.documentId === document.id).length,
      })),
    };
  }

  async createDocument(input: { organizationId: string; projectId: string; title: string; documentType?: string }) {
    const project = this.projects.find((item) => item.id === input.projectId && item.organizationId === input.organizationId);
    if (!project) return null;
    const document: DocumentRecord = {
      id: this.id("document"), projectId: input.projectId, title: input.title,
      documentType: input.documentType ?? null, createdAt: this.now(), updatedAt: this.now(),
    };
    this.documents.push(document);
    return document;
  }

  async getDocument(organizationId: string, documentId: string): Promise<DocumentDetail | null> {
    const document = this.documents.find((item) => item.id === documentId);
    const project = document && this.projects.find((item) => item.id === document.projectId && item.organizationId === organizationId);
    if (!document || !project) return null;
    return {
      ...document,
      project: { id: project.id, name: project.name },
      revisions: this.revisions
        .filter((item) => item.documentId === document.id)
        .sort((left, right) => right.revisionOrder - left.revisionOrder),
    };
  }

  async getRevision(organizationId: string, revisionId: string): Promise<RevisionDetail | null> {
    const revision = this.revisions.find((item) => item.id === revisionId);
    const document = revision && this.documents.find((item) => item.id === revision.documentId);
    const project = document && this.projects.find((item) => item.id === document.projectId && item.organizationId === organizationId);
    if (!revision || !document || !project) return null;
    return {
      ...revision,
      document: { ...document, project: { id: project.id, name: project.name } },
      pages: this.pages.filter((item) => item.documentRevisionId === revision.id).sort((a, b) => a.pageNumber - b.pageNumber),
    };
  }

  async findRevisionByHash(organizationId: string, documentId: string, sha256: string) {
    const document = await this.getDocument(organizationId, documentId);
    if (!document) return null;
    const revision = this.revisions.find((item) => item.documentId === documentId && item.sha256 === sha256);
    return revision ? { id: revision.id } : null;
  }

  async createRevision(input: CreateRevisionRecordInput): Promise<RevisionDetail> {
    if (this.revisions.some((item) => item.documentId === input.documentId && item.sha256 === input.sha256)) {
      throw new DomainError("DUPLICATE_REVISION", "This exact PDF is already a revision of this document.", 409);
    }
    if (this.revisions.some((item) => item.documentId === input.documentId && item.revisionLabel === input.revisionLabel)) {
      throw new DomainError("REVISION_LABEL_CONFLICT", "This revision label is already in use for this document.", 409);
    }
    const revision: RevisionRecord = {
      id: this.id("revision"), documentId: input.documentId, revisionLabel: input.revisionLabel,
      revisionOrder: Math.max(0, ...this.revisions.filter((item) => item.documentId === input.documentId).map((item) => item.revisionOrder)) + 1,
      originalFilename: input.originalFilename, mimeType: input.mimeType, byteSize: input.byteSize,
      sha256: input.sha256, storageKey: input.storageKey, status: input.status,
      failureCode: input.failureCode ?? null, failureMessage: input.failureMessage ?? null, createdAt: this.now(),
    };
    this.revisions.push(revision);
    for (const page of input.pages) {
      this.pages.push({ id: this.id("page"), documentRevisionId: revision.id, ...page, createdAt: this.now() });
    }
    const owningProject = this.projects.find((project) =>
      this.documents.some((document) => document.id === input.documentId && document.projectId === project.id),
    );
    if (!owningProject) throw new Error("Missing project");
    const detail = await this.getRevision(owningProject.organizationId, revision.id);
    if (!detail) throw new Error("Missing revision");
    return detail;
  }
}

export async function seededRepository() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
  return repository;
}
