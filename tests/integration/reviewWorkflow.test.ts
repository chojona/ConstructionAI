import { createPrismaClient } from "@/lib/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocument } from "@/lib/documents/service";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { advanceExtractionRun, createExtractionRun } from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";
import { getProjectReview, recordReviewDecision } from "@/lib/review/service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");

const note = "Install pump 500 GPM.";
const provenance = {
  extractorName: "construction-facts",
  extractorVersion: "construction-facts-v1",
  provider: "openai",
  model: "gpt-4.1",
};

describe("Prisma review workflow", () => {
  const db = createPrismaClient();
  const repository = new PrismaConstructionRepository(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_review_a_${suffix}`;
  const orgB = `it_review_b_${suffix}`;

  beforeAll(async () => {
    await db.organization.createMany({ data: [{ id: orgA, name: "Builder A" }, { id: orgB, name: "Builder B" }] });
  });

  afterAll(async () => {
    const projects = await db.project.findMany({ where: { organizationId: { in: [orgA, orgB] } }, select: { id: true } });
    const projectIds = projects.map(({ id }) => id);
    const decisions = await db.reviewDecision.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    for (const decision of decisions) await db.reviewDecision.delete({ where: { id: decision.id } });
    const documents = await db.document.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const documentIds = documents.map(({ id }) => id);
    const revisions = await db.documentRevision.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
    const revisionIds = revisions.map(({ id }) => id);
    const runs = await db.extractionRun.findMany({ where: { documentRevisionId: { in: revisionIds } }, select: { id: true } });
    const runIds = runs.map(({ id }) => id);
    await db.proposedFactEvidence.deleteMany({ where: { proposedFact: { extractionRunId: { in: runIds } } } });
    await db.proposedFact.deleteMany({ where: { extractionRunId: { in: runIds } } });
    await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentPage.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentRevision.deleteMany({ where: { id: { in: revisionIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
  });

  it("projects an accepted fact without rewriting the proposed fact", async () => {
    const project = await createProject(orgA, { name: "I-95 Bridge" }, repository);
    const document = await createDocument(orgA, project.id, { title: "Drainage Plan" }, repository);
    const revision = await repository.createRevision({
      documentId: document.id,
      revisionLabel: "Revision A",
      originalFilename: "drainage.pdf",
      mimeType: "application/pdf",
      byteSize: 32,
      sha256: `c${suffix}`.padEnd(64, "0").slice(0, 64),
      storageKey: `revisions/${suffix}.pdf`,
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: note, textSha256: "e".repeat(64) }],
    });
    const run = await createExtractionRun(orgA, revision.id, provenance, repository);
    await advanceExtractionRun(orgA, run.id, { status: "RUNNING" }, repository);
    await recordProposedFacts(orgA, run.id, [{
      type: "equipment_requirement",
      equipment: "pump",
      statement: note,
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: note, startOffset: 0, endOffset: note.length }],
    }], repository);

    const before = await db.proposedFact.findFirst({ where: { extractionRunId: run.id }, include: { evidence: true } });
    const accepted = await recordReviewDecision(orgA, project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "Confirmed on the pump schedule.",
      subject: { type: "proposed_fact", proposedFactId: before!.id },
    }, repository, () => new Date("2026-09-30T15:00:00.000Z"));
    const dismissed = await recordReviewDecision(orgA, project.id, "pm-2", {
      decision: "DISMISSED",
      reason: "The pump is existing, not required.",
      subject: { type: "proposed_fact", proposedFactId: before!.id },
    }, repository, () => new Date("2026-09-30T16:00:00.000Z"));

    const after = await db.proposedFact.findFirst({ where: { id: before!.id }, include: { evidence: true } });
    const review = await getProjectReview(orgA, project.id, repository);
    expect(after).toEqual(before);
    expect(dismissed.supersedesDecisionId).toBe(accepted.id);
    expect(accepted.reason).toBe("Confirmed on the pump schedule.");
    expect(review.state.facts).toEqual([]);
    expect(review.decisions).toHaveLength(2);
    await expect(recordReviewDecision(orgB, project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: before!.id },
    }, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.proposedFact.delete({ where: { id: before!.id } })).rejects.toThrow();
    await expect(db.extractionRun.delete({ where: { id: run.id } })).rejects.toThrow();
  });
});
