import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { canAdvanceExtractionRun } from "./lifecycle";

const provenanceSchema = z.object({
  extractorName: z.string().trim().min(1).max(120),
  extractorVersion: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
});

const advanceSchema = z.object({
  status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "SUPERSEDED"]),
  failureCode: z.string().trim().min(1).max(80).optional(),
  failureMessage: z.string().trim().min(1).max(500).optional(),
});

export type Clock = () => Date;

export async function createExtractionRun(
  organizationId: string,
  documentRevisionId: string,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
) {
  const input = provenanceSchema.parse(rawInput);
  const run = await repository.createExtractionRun({ organizationId, documentRevisionId, ...input });
  if (!run) throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  return run;
}

export async function listExtractionRuns(
  organizationId: string,
  documentRevisionId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  const runs = await repository.listExtractionRuns(organizationId, documentRevisionId);
  if (!runs) throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  return runs;
}

export async function getExtractionRun(
  organizationId: string,
  extractionRunId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  const run = await repository.getExtractionRun(organizationId, extractionRunId);
  if (!run) throw new DomainError("NOT_FOUND", "Extraction run not found.", 404);
  return run;
}

export async function advanceExtractionRun(
  organizationId: string,
  extractionRunId: string,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
  clock: Clock = () => new Date(),
) {
  const input = advanceSchema.parse(rawInput);
  const current = await repository.getExtractionRun(organizationId, extractionRunId);
  if (!current) throw new DomainError("NOT_FOUND", "Extraction run not found.", 404);
  if (!canAdvanceExtractionRun(current.status, input.status)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Cannot move an extraction run from ${current.status} to ${input.status}.`,
      409,
    );
  }
  if (input.status === "FAILED" && !input.failureCode) {
    throw new DomainError("INVALID_INPUT", "A failed extraction run requires a failure code.", 400);
  }
  if (input.status !== "FAILED" && (input.failureCode || input.failureMessage)) {
    throw new DomainError("INVALID_INPUT", "Failure metadata belongs only on a failed extraction run.", 400);
  }

  const now = clock();
  const updated = await repository.applyExtractionRunTransition({
    organizationId,
    extractionRunId,
    expectedStatus: current.status,
    status: input.status,
    startedAt: input.status === "RUNNING" ? current.startedAt ?? now : undefined,
    completedAt: input.status === "SUCCEEDED" || input.status === "FAILED" ? now : undefined,
    failureCode: input.status === "FAILED" ? input.failureCode : undefined,
    failureMessage: input.status === "FAILED" ? input.failureMessage ?? null : undefined,
  });
  if (!updated) {
    throw new DomainError("INVALID_TRANSITION", "Extraction run status changed before it could be advanced.", 409);
  }
  return updated;
}
