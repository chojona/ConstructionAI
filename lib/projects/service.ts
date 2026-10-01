import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ConstructionRepository } from "@/lib/domain/repository";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  projectNumber: z.string().trim().max(80).optional().transform((value) => value || undefined),
});

export async function createProject(
  organizationId: string,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
) {
  const input = createProjectSchema.parse(rawInput);
  if (!(await repository.organizationExists(organizationId))) {
    throw new DomainError("NOT_FOUND", "Organization not found.", 404);
  }
  return repository.createProject({ organizationId, ...input });
}

export function listProjects(
  organizationId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  return repository.listProjects(organizationId);
}

export async function getProject(
  organizationId: string,
  projectId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  const project = await repository.getProject(organizationId, projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return project;
}
