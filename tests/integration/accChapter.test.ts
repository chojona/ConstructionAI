import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { createDocument } from "@/lib/documents/service";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { advanceExtractionRun, createExtractionRun } from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";
import { attachAccPdfChapter } from "@/lib/review/accChapter";
import { recordReviewDecision } from "@/lib/review/service";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

const approvedExcerpt = "A CAT 336 excavator shall be used for the trench.";
const rejectedExcerpt = "A dozer shall be used.";
const provenance = {
  extractorName: "construction-facts",
  extractorVersion: "construction-facts-v1",
  provider: "openai",
  model: "gpt-4.1",
};

describe.skipIf(!hasIntegrationDatabase)("Prisma ACC pack chapter", () => {
  const db = integrationDb();
  const storageRoot = mkdtempSync(path.join(tmpdir(), "acc-chapter-"));
  const objects = new LocalObjectStore(storageRoot);
  const repository = new PrismaConstructionRepository(db, objects);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const organizationId = `it_acc_${suffix}`;

  beforeAll(async () => {
    await db.organization.create({ data: { id: organizationId, name: "ACC chapter" } });
  });

  afterAll(async () => {
    await rm(storageRoot, { recursive: true, force: true });
    const projects = await db.project.findMany({ where: { organizationId }, select: { id: true } });
    const projectIds = projects.map(({ id }) => id);
    await db.exportPacketDecision.deleteMany({ where: { exportPacket: { projectId: { in: projectIds } } } });
    await db.exportPacket.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.exportPacketChapterDecision.deleteMany({ where: { chapter: { projectId: { in: projectIds } } } });
    await db.exportPacketChapter.deleteMany({ where: { projectId: { in: projectIds } } });
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
    await db.organization.delete({ where: { id: organizationId } });
    await db.$disconnect();
  });

  it("stores the PDF in the object store and the provenance on the approved pack", async () => {
    const project = await createProject(organizationId, { name: "ACC bridge" }, repository);
    const document = await createDocument(organizationId, project.id, { title: "Drainage Plan" }, repository);
    const revision = await repository.createRevision({
      documentId: document.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 20,
      sha256: `a${suffix}`.padEnd(64, "0").slice(0, 64),
      storageKey: `revisions/acc-${suffix}.pdf`,
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: `${approvedExcerpt}\n${rejectedExcerpt}`, textSha256: "f".repeat(64) }],
    });
    const run = await createExtractionRun(organizationId, revision.id, provenance, repository);
    await advanceExtractionRun(organizationId, run.id, { status: "RUNNING" }, repository);
    await recordProposedFacts(organizationId, run.id, [
      fact(approvedExcerpt, "CAT 336", 0),
      fact(rejectedExcerpt, "dozer", approvedExcerpt.length + 1),
    ], repository);
    const facts = await db.proposedFact.findMany({ where: { extractionRunId: run.id }, orderBy: { ordinal: "asc" } });
    const accepted = await recordReviewDecision(organizationId, project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, () => new Date("2026-10-02T01:00:00.000Z"));
    const dismissed = await recordReviewDecision(organizationId, project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts[1]!.id },
    }, repository, () => new Date("2026-10-02T01:01:00.000Z"));
    const pdf = buildTextPdf(["RFI 42"]);
    const fetchedAt = new Date("2026-10-02T01:05:00.000Z");

    const packet = await attachAccPdfChapter(organizationId, project.id, {
      bytes: pdf,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
      role: "acc-docs",
    }, repository, objects, () => fetchedAt);

    const contentHash = createHash("sha256").update(pdf).digest("hex");
    const storageKey = `export-packets/${project.id}/chapters/${contentHash}.pdf`;
    expect(packet.chapters?.[0]).toMatchObject({
      sourceId: "acc-doc-8841",
      fetchedAt: fetchedAt.toISOString(),
      contentHash,
      storageKey,
    });
    expect(await objects.get(storageKey)).toEqual(pdf);
    const row = await db.exportPacketChapter.findFirstOrThrow({
      where: { projectId: project.id },
      include: { decisions: true },
    });
    expect(row).toMatchObject({ sourceId: "acc-doc-8841", fetchedAt, contentHash, storageKey });
    expect(row.decisions.map((link) => link.reviewDecisionId)).toEqual([accepted.id]);
    const storedPack = await objects.get(`export-packets/${project.id}/${packet.contentHash}.json`);
    expect(createHash("sha256").update(storedPack).digest("hex")).toBe(packet.contentHash);
    expect(JSON.parse(storedPack.toString("utf8")).chapters[0].contentHash).toBe(contentHash);

    await expect(repository.saveExportPacketChapter({
      organizationId,
      projectId: project.id,
      role: "acc-docs",
      title: "ACC export",
      sourceId: "acc-doc-rejected",
      fetchedAt,
      contentHash: "b".repeat(64),
      storageKey: `export-packets/${project.id}/chapters/${"b".repeat(64)}.pdf`,
      filename: "rejected.pdf",
      byteSize: 4,
      reviewDecisionIds: [dismissed.id],
    })).rejects.toMatchObject({ message: "Only an approved change can be exported." });
    expect(await db.exportPacketChapter.count({ where: { projectId: project.id } })).toBe(1);
  });
});

function fact(excerpt: string, equipment: string, startOffset: number) {
  return {
    type: "equipment_requirement" as const,
    equipment,
    statement: excerpt,
    modality: "asserted" as const,
    evidence: [{ pageNumber: 1, excerpt, startOffset, endOffset: startOffset + excerpt.length }],
  };
}
