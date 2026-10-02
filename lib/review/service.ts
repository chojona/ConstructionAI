import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ProjectReviewSource, ReviewDecisionRecord, RevisionChangeType } from "@/lib/domain/types";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { type ProcessingRun, withProcessingRun } from "@/lib/observability/pipelineTiming";
import { compareFacts, toComparableFact, type RevisionFactChange } from "@/lib/revisions/compareFacts";
import {
  buildApprovedChangePacket,
  canonicalPacketBytes,
  exportPacketStorageKey,
  packetChapterFromStored,
  packetContentHash,
  packetFromStored,
} from "./exportPacket";
import { listProjectFindings, type ProjectFinding } from "./findings";
import { projectEffectiveState, type EffectiveProjectState } from "./projectState";
import { proposedFactSubjectKey, removalSubjectKey } from "./subjects";

const subjectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("proposed_fact"),
    proposedFactId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("revision_change"),
    baseRevisionId: z.string().trim().min(1),
    revisedRevisionId: z.string().trim().min(1),
    changeType: z.enum(["ADDED", "REMOVED", "MODIFIED"]),
    beforeProposedFactId: z.string().trim().min(1).nullable(),
    afterProposedFactId: z.string().trim().min(1).nullable(),
  }),
]);

const reviewSchema = z.object({
  decision: z.enum(["ACCEPTED", "DISMISSED", "FLAGGED"]),
  reason: z.string().trim().max(500).optional(),
  subject: subjectSchema,
});

export type Clock = () => Date;

export interface ProjectReview {
  decisions: ReviewDecisionRecord[];
  findings: ProjectFinding[];
  state: EffectiveProjectState;
}

export async function getProjectReview(
  organizationId: string,
  projectId: string,
  repository: ConstructionRepository = constructionRepository,
  timings?: ProcessingRun,
): Promise<ProjectReview> {
  return withProcessingRun(timings, "review_read", async (run) => {
    const loaded = await load(organizationId, projectId, repository);
    return {
      decisions: loaded.decisions,
      findings: listProjectFindings(loaded.source, loaded.decisions, run),
      state: projectEffectiveState({
        projectId,
        revisions: loaded.source.revisions,
        facts: loaded.source.facts,
        decisions: loaded.decisions,
      }),
    };
  });
}

export async function recordReviewDecision(
  organizationId: string,
  projectId: string,
  reviewerId: string | null | undefined,
  rawInput: unknown,
  repository: ConstructionRepository = constructionRepository,
  clock: Clock = () => new Date(),
) {
  const reviewer = reviewerId?.trim() ?? "";
  if (!reviewer || reviewer.length > 120) {
    throw new DomainError("INVALID_INPUT", "Enter your name before recording a decision.", 400);
  }
  const input = reviewSchema.parse(rawInput);
  const reason = input.reason?.trim() || null;
  if ((input.decision === "DISMISSED" || input.decision === "FLAGGED") && !reason) {
    throw new DomainError("INVALID_INPUT", "Add a reason to dismiss or flag.", 400);
  }

  const { source } = await load(organizationId, projectId, repository);
  const recorded = input.subject.type === "proposed_fact"
    ? proposedFactDecision(source, input.subject.proposedFactId)
    : revisionChangeDecision(source, input.subject);

  const decision = await repository.appendReviewDecision({
    organizationId,
    projectId,
    decision: input.decision,
    reviewerId: reviewer,
    reason,
    createdAt: clock(),
    ...recorded,
  });
  if (!decision) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return decision;
}

function proposedFactDecision(source: ProjectReviewSource, proposedFactId: string) {
  const fact = source.facts.find((item) => item.id === proposedFactId);
  if (!fact) throw new DomainError("NOT_FOUND", "Proposed fact not found.", 404);
  return {
    subjectKind: "PROPOSED_FACT" as const,
    subjectKey: proposedFactSubjectKey(fact.id),
    proposedFactId: fact.id,
    beforeProposedFactId: null,
    afterProposedFactId: null,
    baseRevisionId: null,
    revisedRevisionId: null,
    changeType: null,
  };
}

function revisionChangeDecision(
  source: ProjectReviewSource,
  subject: Extract<z.infer<typeof subjectSchema>, { type: "revision_change" }>,
) {
  const change = matchingChange(source, subject);
  if (subject.changeType === "REMOVED") {
    const before = change.before;
    if (!before?.id) throw new DomainError("INVALID_INPUT", "A removal finding requires the prior fact.", 400);
    return {
      subjectKind: "REVISION_CHANGE" as const,
      subjectKey: removalSubjectKey({
        baseRevisionId: subject.baseRevisionId,
        revisedRevisionId: subject.revisedRevisionId,
        before: { ...before, id: before.id },
      }),
      proposedFactId: before.id,
      beforeProposedFactId: before.id,
      afterProposedFactId: null,
      baseRevisionId: subject.baseRevisionId,
      revisedRevisionId: subject.revisedRevisionId,
      changeType: "REMOVED" as const,
    };
  }
  const after = change.after;
  if (!after?.id) throw new DomainError("INVALID_INPUT", "This change has no proposed fact to accept.", 400);
  return {
    subjectKind: "PROPOSED_FACT" as const,
    subjectKey: proposedFactSubjectKey(after.id),
    proposedFactId: after.id,
    beforeProposedFactId: change.before?.id ?? null,
    afterProposedFactId: after.id,
    baseRevisionId: subject.baseRevisionId,
    revisedRevisionId: subject.revisedRevisionId,
    changeType: subject.changeType,
  };
}

function matchingChange(
  source: ProjectReviewSource,
  subject: { baseRevisionId: string; revisedRevisionId: string; changeType: RevisionChangeType; beforeProposedFactId: string | null; afterProposedFactId: string | null },
): RevisionFactChange {
  const base = source.revisions.find((item) => item.id === subject.baseRevisionId);
  const revised = source.revisions.find((item) => item.id === subject.revisedRevisionId);
  if (!base || !revised) throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  if (base.documentId !== revised.documentId) {
    throw new DomainError("INVALID_INPUT", "Revisions must belong to the same document.", 400);
  }
  const beforeRun = requireRun(source, base.id);
  const afterRun = requireRun(source, revised.id);
  const changes = compareFacts(
    source.facts.filter((fact) => fact.extractionRunId === beforeRun.id).map(toComparableFact),
    source.facts.filter((fact) => fact.extractionRunId === afterRun.id).map(toComparableFact),
  );
  const match = changes.find((change) => (
    change.changeType === subject.changeType
    && (change.before?.id ?? null) === subject.beforeProposedFactId
    && (change.after?.id ?? null) === subject.afterProposedFactId
  ));
  if (!match) throw new DomainError("INVALID_INPUT", "That revision change is not a finding for these revisions.", 400);
  return match;
}

function requireRun(source: ProjectReviewSource, revisionId: string) {
  const run = source.runs
    .filter((item) => (
      item.documentRevisionId === revisionId
      && item.status === "SUCCEEDED"
      && item.extractorName === CONSTRUCTION_FACTS_EXTRACTOR.name
      && item.extractorVersion === CONSTRUCTION_FACTS_EXTRACTOR.version
    ))
    .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
  if (!run) throw new DomainError("INVALID_INPUT", "Revision has no succeeded construction-facts-v1 extraction.", 400);
  return run;
}

const exportQuerySchema = z.object({
  subjectKey: z.string().trim().min(1).max(2000).optional(),
});

export async function currentApprovedChangePacket(
  organizationId: string,
  projectId: string,
  repository: ConstructionRepository,
  subjectKey?: string,
) {
  const { source, decisions } = await load(organizationId, projectId, repository);
  const findings = listProjectFindings(source, decisions);
  const base = buildApprovedChangePacket({
    projectId,
    findings,
    revisions: source.revisions,
    subjectKey,
  });
  const storedChapters = await repository.listExportPacketChapters(organizationId, projectId, base.decisionIds);
  if (!storedChapters) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  if (storedChapters.length === 0) return base;
  return buildApprovedChangePacket({
    projectId,
    findings,
    revisions: source.revisions,
    subjectKey,
    chapters: storedChapters.map(packetChapterFromStored),
  });
}

export async function exportApprovedChangePacket(
  organizationId: string,
  projectId: string,
  rawQuery: { subjectKey?: string | null } = {},
  repository: ConstructionRepository = constructionRepository,
  clock: Clock = () => new Date(),
) {
  const subjectKey = exportQuerySchema.parse({
    subjectKey: rawQuery.subjectKey?.trim() || undefined,
  }).subjectKey;
  const built = await currentApprovedChangePacket(organizationId, projectId, repository, subjectKey);
  const payload = canonicalPacketBytes(built);
  const contentHash = packetContentHash(built);
  const stored = await repository.saveExportPacket({
    organizationId,
    projectId,
    contentHash,
    storageKey: exportPacketStorageKey(projectId, contentHash),
    payload,
    reviewDecisionIds: built.changes.map((change) => change.decisionId),
    createdAt: clock(),
  });
  if (!stored) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return packetFromStored(stored);
}

export async function readStoredExportPacket(
  organizationId: string,
  projectId: string,
  exportPacketId: string,
  repository: ConstructionRepository = constructionRepository,
) {
  const stored = await repository.getExportPacketById(organizationId, projectId, exportPacketId);
  if (!stored) throw new DomainError("NOT_FOUND", "Approved pack not found.", 404);
  packetFromStored(stored);
  return stored;
}

async function load(organizationId: string, projectId: string, repository: ConstructionRepository) {
  const source = await repository.getProjectReviewSource(organizationId, projectId);
  if (!source) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  const decisions = await repository.listReviewDecisions(organizationId, projectId);
  if (!decisions) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return { source, decisions };
}
