import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "./errors";
import type {
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
