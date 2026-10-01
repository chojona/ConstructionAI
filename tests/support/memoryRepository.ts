import { DomainError } from "@/lib/domain/errors";
import type {
  AppendReviewDecisionInput,
  ConstructionRepository,
  CommitProposedFactsInput,
  CreateExtractionRunInput,
  CreateRevisionRecordInput,
  ExtractionRunTransitionInput,
} from "@/lib/domain/repository";
import type {
  DocumentDetail,
  DocumentRecord,
  ExtractionRunRecord,
  ProjectDetail,
  ProjectRecord,
  ProjectReviewSource,
  ProjectSummary,
  ProposedFactRecord,
  ReviewDecisionRecord,
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
  readonly extractionRuns: ExtractionRunRecord[] = [];
  readonly proposedFacts: ProposedFactRecord[] = [];
  readonly reviewDecisions: ReviewDecisionRecord[] = [];
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

  async createExtractionRun(input: CreateExtractionRunInput): Promise<ExtractionRunRecord | null> {
    const revision = await this.getRevision(input.organizationId, input.documentRevisionId);
    if (!revision) return null;
    if (revision.status !== "PROCESSED") {
      throw new DomainError("REVISION_NOT_READY", "Only a processed revision can be analyzed.", 409);
    }
    const attemptNumber = Math.max(
      0,
      ...this.extractionRuns
        .filter((run) => run.documentRevisionId === input.documentRevisionId)
        .map((run) => run.attemptNumber),
    ) + 1;
    const run: ExtractionRunRecord = {
      id: this.id("extraction"),
      documentRevisionId: input.documentRevisionId,
      attemptNumber,
      extractorName: input.extractorName,
      extractorVersion: input.extractorVersion,
      provider: input.provider,
      model: input.model,
      status: "QUEUED",
      failureCode: null,
      failureMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: this.now(),
    };
    this.extractionRuns.push(run);
    return this.copyRun(run);
  }

  async listExtractionRuns(organizationId: string, documentRevisionId: string) {
    const revision = await this.getRevision(organizationId, documentRevisionId);
    if (!revision) return null;
    return this.extractionRuns
      .filter((run) => run.documentRevisionId === documentRevisionId)
      .sort((left, right) => left.attemptNumber - right.attemptNumber)
      .map((run) => this.copyRun(run));
  }

  async getExtractionRun(organizationId: string, extractionRunId: string) {
    const run = this.extractionRunInOrganization(organizationId, extractionRunId);
    return run ? this.copyRun(run) : null;
  }

  async applyExtractionRunTransition(input: ExtractionRunTransitionInput): Promise<ExtractionRunRecord | null> {
    const run = this.extractionRunInOrganization(input.organizationId, input.extractionRunId);
    if (!run || run.status !== input.expectedStatus) return null;
    run.status = input.status;
    if (input.startedAt) run.startedAt = input.startedAt;
    if (input.completedAt) run.completedAt = input.completedAt;
    if (input.failureCode !== undefined) run.failureCode = input.failureCode;
    if (input.failureMessage !== undefined) run.failureMessage = input.failureMessage;
    return this.copyRun(run);
  }

  async commitProposedFacts(input: CommitProposedFactsInput): Promise<ExtractionRunRecord | null> {
    const run = this.extractionRunInOrganization(input.organizationId, input.extractionRunId);
    if (!run || run.status !== input.expectedStatus) return null;
    const revisionPages = this.pages.filter((page) => page.documentRevisionId === run.documentRevisionId);
    const facts: ProposedFactRecord[] = input.facts.map((fact, ordinal) => ({
      id: this.id("fact"),
      extractionRunId: run.id,
      ordinal,
      factType: fact.factType,
      payload: { ...fact.payload },
      createdAt: this.now(),
      evidence: fact.evidence.map((item) => {
        const page = revisionPages.find((candidate) => candidate.id === item.documentPageId);
        if (!page || page.pageNumber !== item.pageNumber) {
          throw new DomainError("INVALID_INPUT", "Evidence references a page that is not part of this revision.", 400);
        }
        return { ...item };
      }),
    }));
    run.status = "SUCCEEDED";
    run.completedAt = input.completedAt;
    this.proposedFacts.push(...facts);
    return this.copyRun(run);
  }

  async listProposedFacts(organizationId: string, extractionRunId: string) {
    const run = this.extractionRunInOrganization(organizationId, extractionRunId);
    if (!run) return null;
    return this.proposedFacts
      .filter((fact) => fact.extractionRunId === extractionRunId)
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((fact) => this.copyFact(fact));
  }

  async getProjectReviewSource(organizationId: string, projectId: string): Promise<ProjectReviewSource | null> {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    const documents = this.documents.filter((item) => item.projectId === project.id);
    const documentIds = new Set(documents.map((item) => item.id));
    const revisions = this.revisions
      .filter((item) => documentIds.has(item.documentId))
      .map((item) => ({
        id: item.id,
        documentId: item.documentId,
        documentTitle: documents.find((document) => document.id === item.documentId)?.title ?? "",
        revisionLabel: item.revisionLabel,
        revisionOrder: item.revisionOrder,
      }));
    const revisionIds = new Set(revisions.map((item) => item.id));
    const runs = this.extractionRuns
      .filter((item) => revisionIds.has(item.documentRevisionId))
      .map((item) => ({
        id: item.id,
        documentRevisionId: item.documentRevisionId,
        attemptNumber: item.attemptNumber,
        extractorName: item.extractorName,
        extractorVersion: item.extractorVersion,
        status: item.status,
      }));
    const facts = this.proposedFacts.flatMap((fact) => {
      const run = this.extractionRuns.find((item) => item.id === fact.extractionRunId);
      if (!run || !revisionIds.has(run.documentRevisionId)) return [];
      return [{ ...this.copyFact(fact), documentRevisionId: run.documentRevisionId }];
    });
    return { projectId, revisions, runs, facts };
  }

  async listReviewDecisions(organizationId: string, projectId: string) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    return this.reviewDecisions
      .filter((item) => item.projectId === projectId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
      .map((item) => ({ ...item }));
  }

  async appendReviewDecision(input: AppendReviewDecisionInput): Promise<ReviewDecisionRecord | null> {
    const project = this.projects.find((item) => item.id === input.projectId && item.organizationId === input.organizationId);
    if (!project) return null;
    const prior = this.reviewDecisions
      .filter((item) => item.projectId === input.projectId && item.subjectKey === input.subjectKey)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))[0];
    const decision: ReviewDecisionRecord = {
      id: this.id("review"),
      projectId: input.projectId,
      subjectKind: input.subjectKind,
      subjectKey: input.subjectKey,
      decision: input.decision,
      reviewerId: input.reviewerId,
      reason: input.reason,
      proposedFactId: input.proposedFactId,
      beforeProposedFactId: input.beforeProposedFactId,
      afterProposedFactId: input.afterProposedFactId,
      baseRevisionId: input.baseRevisionId,
      revisedRevisionId: input.revisedRevisionId,
      changeType: input.changeType,
      supersedesDecisionId: prior?.id ?? null,
      createdAt: input.createdAt,
    };
    this.reviewDecisions.push(decision);
    return { ...decision };
  }

  private extractionRunInOrganization(organizationId: string, extractionRunId: string) {
    const run = this.extractionRuns.find((item) => item.id === extractionRunId);
    if (!run) return null;
    const revision = this.revisions.find((item) => item.id === run.documentRevisionId);
    const document = revision && this.documents.find((item) => item.id === revision.documentId);
    const project = document && this.projects.find((item) => item.id === document.projectId && item.organizationId === organizationId);
    return project ? run : null;
  }

  private copyRun(run: ExtractionRunRecord): ExtractionRunRecord {
    return { ...run };
  }

  private copyFact(fact: ProposedFactRecord): ProposedFactRecord {
    return {
      ...fact,
      payload: { ...fact.payload },
      evidence: fact.evidence.map((item) => ({ ...item })),
    };
  }
}

export async function seededRepository() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
  return repository;
}
