import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "./errors";
import type {
  CommitProposedFactsInput,
  ConstructionRepository,
  CreateExtractionRunInput,
  CreateRevisionRecordInput,
  ExtractionRunTransitionInput,
} from "./repository";
import type {
  DocumentDetail,
  ExtractionRunRecord,
  ProjectDetail,
  ProjectSummary,
  ProposedFactRecord,
  RevisionDetail,
} from "./types";

export class PrismaConstructionRepository implements ConstructionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async organizationExists(organizationId: string) {
    return (await this.db.organization.count({ where: { id: organizationId } })) > 0;
  }

  createProject(input: { organizationId: string; name: string; projectNumber?: string }) {
    return this.db.project.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        projectNumber: input.projectNumber || null,
      },
    });
  }

  async listProjects(organizationId: string): Promise<ProjectSummary[]> {
    const projects = await this.db.project.findMany({
      where: { organizationId },
      include: { _count: { select: { documents: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return projects.map(({ _count, ...project }) => ({
      ...project,
      documentCount: _count.documents,
    }));
  }

  async getProject(organizationId: string, projectId: string): Promise<ProjectDetail | null> {
    const project = await this.db.project.findFirst({
      where: { id: projectId, organizationId },
      include: {
        documents: {
          include: { _count: { select: { revisions: true } } },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        },
      },
    });
    if (!project) return null;
    return {
      ...project,
      documents: project.documents.map(({ _count, ...document }) => ({
        ...document,
        revisionCount: _count.revisions,
      })),
    };
  }

  async createDocument(input: {
    organizationId: string;
    projectId: string;
    title: string;
    documentType?: string;
  }) {
    const project = await this.db.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!project) return null;
    return this.db.document.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        documentType: input.documentType || null,
      },
    });
  }

  async getDocument(organizationId: string, documentId: string): Promise<DocumentDetail | null> {
    return this.db.document.findFirst({
      where: { id: documentId, project: { organizationId } },
      include: {
        project: { select: { id: true, name: true } },
        revisions: { orderBy: [{ revisionOrder: "desc" }, { id: "asc" }] },
      },
    }) as Promise<DocumentDetail | null>;
  }

  async getRevision(organizationId: string, revisionId: string): Promise<RevisionDetail | null> {
    return this.db.documentRevision.findFirst({
      where: { id: revisionId, document: { project: { organizationId } } },
      include: {
        document: { include: { project: { select: { id: true, name: true } } } },
        pages: { orderBy: { pageNumber: "asc" } },
      },
    }) as Promise<RevisionDetail | null>;
  }

  findRevisionByHash(organizationId: string, documentId: string, sha256: string) {
    return this.db.documentRevision.findFirst({
      where: { documentId, sha256, document: { project: { organizationId } } },
      select: { id: true },
    });
  }

  async createRevision(input: CreateRevisionRecordInput): Promise<RevisionDetail> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const latest = await tx.documentRevision.findFirst({
              where: { documentId: input.documentId },
              orderBy: { revisionOrder: "desc" },
              select: { revisionOrder: true },
            });
            return tx.documentRevision.create({
              data: {
                documentId: input.documentId,
                revisionLabel: input.revisionLabel,
                revisionOrder: (latest?.revisionOrder ?? 0) + 1,
                originalFilename: input.originalFilename,
                mimeType: input.mimeType,
                byteSize: input.byteSize,
                sha256: input.sha256,
                storageKey: input.storageKey,
                status: input.status,
                failureCode: input.failureCode,
                failureMessage: input.failureMessage,
                pages: { create: input.pages },
              },
              include: {
                document: { include: { project: { select: { id: true, name: true } } } },
                pages: { orderBy: { pageNumber: "asc" } },
              },
            }) as Promise<RevisionDetail>;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2034" && attempt < 2) continue;
          if (error.code === "P2002") {
            const targets = Array.isArray(error.meta?.target) ? error.meta.target : [];
            if (targets.includes("revisionOrder") && attempt < 2) continue;
            if (targets.includes("sha256")) {
              throw new DomainError("DUPLICATE_REVISION", "This exact PDF is already a revision of this document.", 409);
            }
            if (targets.includes("revisionLabel")) {
              throw new DomainError("REVISION_LABEL_CONFLICT", "This revision label is already in use for this document.", 409);
            }
          }
        }
        throw error;
      }
    }
    throw new Error("Revision transaction retry limit exceeded.");
  }

  async createExtractionRun(input: CreateExtractionRunInput): Promise<ExtractionRunRecord | null> {
    const revision = await this.db.documentRevision.findFirst({
      where: {
        id: input.documentRevisionId,
        document: { project: { organizationId: input.organizationId } },
      },
      select: { id: true, status: true },
    });
    if (!revision) return null;
    if (revision.status !== "PROCESSED") {
      throw new DomainError("REVISION_NOT_READY", "Only a processed revision can be analyzed.", 409);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const latest = await tx.extractionRun.findFirst({
              where: { documentRevisionId: input.documentRevisionId },
              orderBy: { attemptNumber: "desc" },
              select: { attemptNumber: true },
            });
            return tx.extractionRun.create({
              data: {
                documentRevisionId: input.documentRevisionId,
                attemptNumber: (latest?.attemptNumber ?? 0) + 1,
                extractorName: input.extractorName,
                extractorVersion: input.extractorVersion,
                provider: input.provider,
                model: input.model,
                status: "QUEUED",
              },
              select: extractionRunSelect,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2034" && attempt < 2) continue;
          if (error.code === "P2002") {
            const targets = Array.isArray(error.meta?.target) ? error.meta.target : [];
            if (targets.includes("attemptNumber") && attempt < 2) continue;
          }
        }
        throw error;
      }
    }
    throw new Error("Extraction run transaction retry limit exceeded.");
  }

  async listExtractionRuns(organizationId: string, documentRevisionId: string) {
    const revision = await this.db.documentRevision.findFirst({
      where: { id: documentRevisionId, document: { project: { organizationId } } },
      select: { id: true },
    });
    if (!revision) return null;
    return this.db.extractionRun.findMany({
      where: { documentRevisionId },
      select: extractionRunSelect,
      orderBy: [{ attemptNumber: "asc" }, { id: "asc" }],
    });
  }

  getExtractionRun(organizationId: string, extractionRunId: string) {
    return this.db.extractionRun.findFirst({
      where: {
        id: extractionRunId,
        documentRevision: { document: { project: { organizationId } } },
      },
      select: extractionRunSelect,
    });
  }

  async applyExtractionRunTransition(input: ExtractionRunTransitionInput): Promise<ExtractionRunRecord | null> {
    const data: Prisma.ExtractionRunUpdateManyMutationInput = { status: input.status };
    if (input.startedAt) data.startedAt = input.startedAt;
    if (input.completedAt) data.completedAt = input.completedAt;
    if (input.failureCode !== undefined) data.failureCode = input.failureCode;
    if (input.failureMessage !== undefined) data.failureMessage = input.failureMessage;

    const updated = await this.db.extractionRun.updateMany({
      where: {
        id: input.extractionRunId,
        status: input.expectedStatus,
        documentRevision: { document: { project: { organizationId: input.organizationId } } },
      },
      data,
    });
    if (updated.count !== 1) return null;
    return this.getExtractionRun(input.organizationId, input.extractionRunId);
  }

  async commitProposedFacts(input: CommitProposedFactsInput): Promise<ExtractionRunRecord | null> {
    const run = await this.db.extractionRun.findFirst({
      where: {
        id: input.extractionRunId,
        status: input.expectedStatus,
        documentRevision: { document: { project: { organizationId: input.organizationId } } },
      },
      select: { id: true, documentRevisionId: true },
    });
    if (!run) return null;

    const pages = await this.db.documentPage.findMany({
      where: { documentRevisionId: run.documentRevisionId },
      select: { id: true, pageNumber: true, text: true },
    });
    for (const fact of input.facts) {
      for (const item of fact.evidence) {
        const page = pages.find((candidate) => candidate.id === item.documentPageId);
        const located = page?.text.slice(item.startOffset, item.endOffset);
        if (!page || page.pageNumber !== item.pageNumber || item.endOffset <= item.startOffset || located !== item.excerpt) {
          throw new DomainError("INVALID_INPUT", "Evidence references a page that is not part of this revision.", 400);
        }
      }
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.extractionRun.updateMany({
        where: { id: run.id, status: input.expectedStatus },
        data: { status: "SUCCEEDED", completedAt: input.completedAt },
      });
      if (updated.count !== 1) return null;
      for (const [ordinal, fact] of input.facts.entries()) {
        await tx.proposedFact.create({
          data: {
            extractionRunId: run.id,
            ordinal,
            factType: fact.factType,
            payload: fact.payload,
            evidence: {
              create: fact.evidence.map((item, evidenceOrdinal) => ({
                documentPageId: item.documentPageId,
                ordinal: evidenceOrdinal,
                pageNumber: item.pageNumber,
                excerpt: item.excerpt,
                startOffset: item.startOffset,
                endOffset: item.endOffset,
              })),
            },
          },
        });
      }
      return tx.extractionRun.findFirst({ where: { id: run.id }, select: extractionRunSelect });
    });
  }

  async listProposedFacts(organizationId: string, extractionRunId: string): Promise<ProposedFactRecord[] | null> {
    const run = await this.getExtractionRun(organizationId, extractionRunId);
    if (!run) return null;
    const facts = await this.db.proposedFact.findMany({
      where: { extractionRunId },
      select: proposedFactSelect,
      orderBy: { ordinal: "asc" },
    });
    return facts.map(toProposedFactRecord);
  }
}

const proposedFactSelect = {
  id: true,
  extractionRunId: true,
  ordinal: true,
  factType: true,
  payload: true,
  createdAt: true,
  evidence: {
    orderBy: { ordinal: "asc" as const },
    select: {
      documentPageId: true,
      pageNumber: true,
      excerpt: true,
      startOffset: true,
      endOffset: true,
    },
  },
} as const;

function toProposedFactRecord(fact: {
  id: string;
  extractionRunId: string;
  ordinal: number;
  factType: ProposedFactRecord["factType"];
  payload: Prisma.JsonValue;
  createdAt: Date;
  evidence: ProposedFactRecord["evidence"];
}): ProposedFactRecord {
  if (!fact.payload || typeof fact.payload !== "object" || Array.isArray(fact.payload)) {
    throw new Error("Stored proposed fact payload is invalid.");
  }
  const payload: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fact.payload)) {
    if (value !== null && typeof value !== "string") {
      throw new Error("Stored proposed fact payload is invalid.");
    }
    payload[key] = value;
  }
  return { ...fact, payload };
}

const extractionRunSelect = {
  id: true,
  documentRevisionId: true,
  attemptNumber: true,
  extractorName: true,
  extractorVersion: true,
  provider: true,
  model: true,
  status: true,
  failureCode: true,
  failureMessage: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} as const;

export const constructionRepository = new PrismaConstructionRepository();
