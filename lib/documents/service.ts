import { z } from "zod";
import { requireDocumentAccess, requireProjectAccess, requireRevisionAccess } from "@/lib/access/projectAccess";
import { DomainError } from "@/lib/domain/errors";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ConstructionRepository } from "@/lib/domain/repository";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  documentType: z.string().trim().max(80).optional().transform((value) => value || undefined),
});

export async function createDocument(
  organizationId: string,
  projectId: string,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
) {
  const input = createDocumentSchema.parse(rawInput);
  await requireProjectAccess({ organizationId }, projectId, repository);
  const document = await repository.createDocument({ organizationId, projectId, ...input });
  if (!document) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return document;
}

export async function listDocumentRegister(
  organizationId: string,
  projectId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  await requireProjectAccess({ organizationId }, projectId, repository);
  const documents = await repository.listDocumentRegister(organizationId, projectId);
  if (!documents) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return documents;
}

export async function getDocument(
  organizationId: string,
  documentId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  return requireDocumentAccess({ organizationId }, documentId, repository);
}

export async function getRevision(
  organizationId: string,
  revisionId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  return requireRevisionAccess({ organizationId }, revisionId, repository);
}

export async function listRevisionAnalysis(
  organizationId: string,
  revisionId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  await requireRevisionAccess({ organizationId }, revisionId, repository);
  const runs = await repository.listExtractionRuns(organizationId, revisionId);
  if (!runs) throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  return runs;
}
