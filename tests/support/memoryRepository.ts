import { DomainError } from "@/lib/domain/errors";
import { sameIdSet } from "@/lib/domain/repository";
import type {
  AppendReviewDecisionInput,
  ConstructionRepository,
  CommitProposedFactsInput,
  CreateExtractionRunInput,
  CreateRevisionRecordInput,
  ExtractionRunTransitionInput,
  FailOpenExtractionInput,
  CreateEmailSendInput,
  EmailSendRecord,
  SaveExportPacketChapterInput,
  SaveExportPacketInput,
  StoredExportPacket,
  StoredExportPacketChapter,
  UpdateEmailDraftInput,
} from "@/lib/domain/repository";
import { PACK_MISSING_MESSAGE } from "@/lib/email/emailSendView";
import { EXPORT_BLOCKED_MESSAGE } from "@/lib/review/exportPacket";
import { PACK_CITE_UNPINNED_MESSAGE, canonicalPackPageCite, type PackPageCite } from "@/lib/review/exportPacketView";
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
  readonly exportPackets: StoredExportPacket[] = [];
  readonly exportPacketChapters: StoredExportPacketChapter[] = [];
  readonly emailSends: EmailSendRecord[] = [];
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

  async failOpenExtraction(input: FailOpenExtractionInput): Promise<ExtractionRunRecord | null> {
    const run = this.extractionRunInOrganization(input.organizationId, input.extractionRunId);
    if (!run || (run.status !== "QUEUED" && run.status !== "RUNNING")) return null;
    const factIds = new Set(
      this.proposedFacts.filter((fact) => fact.extractionRunId === run.id).map((fact) => fact.id),
    );
    const referenced = this.reviewDecisions.some((decision) => (
      factIds.has(decision.proposedFactId)
      || (decision.beforeProposedFactId !== null && factIds.has(decision.beforeProposedFactId))
      || (decision.afterProposedFactId !== null && factIds.has(decision.afterProposedFactId))
    ));
    if (!referenced) {
      for (let index = this.proposedFacts.length - 1; index >= 0; index -= 1) {
        if (this.proposedFacts[index]?.extractionRunId === run.id) this.proposedFacts.splice(index, 1);
      }
    }
    run.status = "FAILED";
    run.completedAt = input.completedAt;
    run.failureCode = input.failureCode;
    run.failureMessage = input.failureMessage;
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
        sha256: item.sha256,
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

  async saveExportPacket(input: SaveExportPacketInput): Promise<StoredExportPacket | null> {
    const project = this.projects.find((item) => item.id === input.projectId && item.organizationId === input.organizationId);
    if (!project) return null;
    if (input.reviewDecisionIds.length === 0) {
      throw new DomainError("INVALID_INPUT", EXPORT_BLOCKED_MESSAGE, 400);
    }
    const linked = input.reviewDecisionIds.map((id) => this.reviewDecisions.find((decision) => decision.id === id && decision.projectId === input.projectId));
    if (linked.some((decision) => decision?.decision !== "ACCEPTED")) {
      throw new DomainError("INVALID_INPUT", "Only an approved change can be exported.", 400);
    }
    const existing = this.exportPackets.find((packet) => packet.projectId === input.projectId && packet.contentHash === input.contentHash);
    if (existing) return copyExportPacket(existing);
    const stored: StoredExportPacket = {
      id: this.id("packet"),
      projectId: input.projectId,
      contentHash: input.contentHash,
      storageKey: input.storageKey,
      payload: Buffer.from(input.payload),
      byteSize: input.payload.byteLength,
      createdAt: input.createdAt,
      reviewDecisionIds: [...input.reviewDecisionIds],
    };
    this.exportPackets.push(stored);
    return copyExportPacket(stored);
  }

  async getExportPacketByContentHash(organizationId: string, projectId: string, contentHash: string) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    const packet = this.exportPackets.find((item) => item.projectId === projectId && item.contentHash === contentHash);
    return packet ? copyExportPacket(packet) : null;
  }

  async getExportPacketById(organizationId: string, projectId: string, exportPacketId: string) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    const packet = this.exportPackets.find((item) => item.id === exportPacketId && item.projectId === projectId);
    return packet ? copyExportPacket(packet) : null;
  }

  async findLatestExportPacketForDecisions(organizationId: string, projectId: string, reviewDecisionIds: string[]) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project || reviewDecisionIds.length === 0) return null;
    const matches = this.exportPackets
      .map((packet, index) => ({ packet, index }))
      .filter(({ packet }) => packet.projectId === projectId && sameIdSet(packet.reviewDecisionIds, reviewDecisionIds));
    matches.sort((left, right) => (
      right.packet.createdAt.getTime() - left.packet.createdAt.getTime()
      || right.index - left.index
    ));
    const latest = matches[0]?.packet;
    return latest ? copyExportPacket(latest) : null;
  }

  async saveExportPacketChapter(input: SaveExportPacketChapterInput): Promise<StoredExportPacketChapter | null> {
    const project = this.projects.find((item) => item.id === input.projectId && item.organizationId === input.organizationId);
    if (!project) return null;
    if (input.reviewDecisionIds.length === 0) {
      throw new DomainError("INVALID_INPUT", EXPORT_BLOCKED_MESSAGE, 400);
    }
    const linked = input.reviewDecisionIds.map((id) => this.reviewDecisions.find((decision) => decision.id === id && decision.projectId === input.projectId));
    if (linked.some((decision) => decision?.decision !== "ACCEPTED")) {
      throw new DomainError("INVALID_INPUT", "Only an approved change can be exported.", 400);
    }
    const pageCites = pageCitesFor(input);
    const existing = this.exportPacketChapters.find((chapter) => (
      chapter.projectId === input.projectId
      && chapter.contentHash === input.contentHash
      && chapter.role === input.role
    ));
    if (existing) {
      if ((existing.legacyPageLabels?.length ?? 0) > 0) {
        existing.pageCites = pageCites;
        existing.legacyPageLabels = [];
      }
      const sameLinks = existing.reviewDecisionIds.length === input.reviewDecisionIds.length
        && existing.reviewDecisionIds.every((id, index) => id === input.reviewDecisionIds[index]);
      if (!sameLinks) existing.reviewDecisionIds = [...input.reviewDecisionIds];
      return copyExportPacketChapter(existing);
    }
    const stored: StoredExportPacketChapter = {
      id: this.id("chapter"),
      projectId: input.projectId,
      role: input.role,
      title: input.title,
      sourceId: input.sourceId,
      fetchedAt: new Date(input.fetchedAt),
      contentHash: input.contentHash,
      storageKey: input.storageKey,
      filename: input.filename,
      byteSize: input.byteSize,
      pageCites,
      reviewDecisionIds: [...input.reviewDecisionIds],
    };
    this.exportPacketChapters.push(stored);
    return copyExportPacketChapter(stored);
  }

  async listExportPacketChapters(organizationId: string, projectId: string, reviewDecisionIds: string[]) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    const accepted = new Set(reviewDecisionIds);
    return this.exportPacketChapters
      .filter((chapter) => (
        chapter.projectId === projectId
        && chapter.reviewDecisionIds.length > 0
        && chapter.reviewDecisionIds.every((id) => accepted.has(id))
      ))
      .sort((left, right) => (
        left.role.localeCompare(right.role)
        || left.sourceId.localeCompare(right.sourceId)
        || left.contentHash.localeCompare(right.contentHash)
      ))
      .map(copyExportPacketChapter);
  }

  async createEmailSend(input: CreateEmailSendInput): Promise<EmailSendRecord | null> {
    const project = this.projects.find((item) => item.id === input.projectId && item.organizationId === input.organizationId);
    if (!project) return null;
    this.assertEmailLinks(input.projectId, input.exportPacketId, input.documentIds, input.reviewDecisionIds);
    const stored: EmailSendRecord = {
      id: this.id("email"),
      projectId: input.projectId,
      exportPacketId: input.exportPacketId,
      status: input.status,
      recipients: [...input.recipients],
      subject: input.subject,
      body: input.body,
      actorId: input.actorId,
      documentIds: [...input.documentIds],
      reviewDecisionIds: [...input.reviewDecisionIds],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      sentAt: input.sentAt,
    };
    this.emailSends.push(stored);
    return copyEmailSend(stored);
  }

  async updateEmailDraft(input: UpdateEmailDraftInput): Promise<EmailSendRecord | null> {
    const project = this.projects.find((item) => item.id === input.projectId && item.organizationId === input.organizationId);
    if (!project) return null;
    const current = this.emailSends.find((item) => item.id === input.emailSendId && item.projectId === input.projectId);
    if (!current || current.status !== "DRAFT") return null;
    current.status = input.status;
    current.recipients = [...input.recipients];
    current.subject = input.subject;
    current.body = input.body;
    current.actorId = input.actorId;
    current.updatedAt = input.updatedAt;
    current.sentAt = input.sentAt;
    return copyEmailSend(current);
  }

  async getEmailSend(organizationId: string, projectId: string, emailSendId: string) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    const email = this.emailSends.find((item) => item.id === emailSendId && item.projectId === projectId);
    return email ? copyEmailSend(email) : null;
  }

  async findLatestDraftEmailSend(organizationId: string, projectId: string, exportPacketId: string) {
    const project = this.projects.find((item) => item.id === projectId && item.organizationId === organizationId);
    if (!project) return null;
    const drafts = this.emailSends
      .filter((item) => item.projectId === projectId && item.exportPacketId === exportPacketId && item.status === "DRAFT")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id));
    const latest = drafts[0];
    return latest ? copyEmailSend(latest) : null;
  }

  private assertEmailLinks(projectId: string, exportPacketId: string, documentIds: string[], reviewDecisionIds: string[]) {
    const packet = this.exportPackets.find((item) => item.id === exportPacketId && item.projectId === projectId);
    if (!packet || documentIds.length === 0 || reviewDecisionIds.length === 0) {
      throw new DomainError("INVALID_INPUT", PACK_MISSING_MESSAGE, 400);
    }
    const decisions = reviewDecisionIds.map((id) => this.reviewDecisions.find((decision) => decision.id === id && decision.projectId === projectId));
    if (decisions.some((decision) => decision?.decision !== "ACCEPTED")) {
      throw new DomainError("INVALID_INPUT", "Only an approved change can be exported.", 400);
    }
    const documents = documentIds.map((id) => this.documents.find((document) => document.id === id && document.projectId === projectId));
    if (documents.some((document) => !document)) {
      throw new DomainError("INVALID_INPUT", PACK_MISSING_MESSAGE, 400);
    }
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

function copyExportPacket(packet: StoredExportPacket): StoredExportPacket {
  return { ...packet, payload: Buffer.from(packet.payload), reviewDecisionIds: [...packet.reviewDecisionIds] };
}

function copyExportPacketChapter(chapter: StoredExportPacketChapter): StoredExportPacketChapter {
  return {
    ...chapter,
    fetchedAt: new Date(chapter.fetchedAt),
    pageCites: chapter.pageCites.map((cite) => ({ ...cite })),
    legacyPageLabels: [...(chapter.legacyPageLabels ?? [])],
    reviewDecisionIds: [...chapter.reviewDecisionIds],
  };
}

function pageCitesFor(input: SaveExportPacketChapterInput): PackPageCite[] {
  if (input.role !== "bluebeam-markup") return [];
  const cites = [...(input.pageCites ?? [])].map((cite) => canonicalPackPageCite(cite));
  if (cites.length === 0 || cites.some((cite) => cite === null)) {
    throw new DomainError("INVALID_INPUT", PACK_CITE_UNPINNED_MESSAGE, 400);
  }
  return cites.filter((cite): cite is PackPageCite => cite !== null);
}

function copyEmailSend(email: EmailSendRecord): EmailSendRecord {
  return {
    ...email,
    recipients: [...email.recipients],
    documentIds: [...email.documentIds],
    reviewDecisionIds: [...email.reviewDecisionIds],
  };
}

export async function seededRepository() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
  return repository;
}
