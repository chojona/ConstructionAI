import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocument } from "@/lib/documents/service";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { advanceExtractionRun, createExtractionRun } from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";
import { EXPORT_BLOCKED_MESSAGE } from "@/lib/review/exportPacket";
import { exportApprovedChangePacket, readStoredExportPacket, recordReviewDecision } from "@/lib/review/service";
import { migrateExportPacketPayloads } from "@/lib/storage/migrateObjectBytes";
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

describe.skipIf(!hasIntegrationDatabase)("Prisma export packet", () => {
  const db = integrationDb();
  const storageRoot = mkdtempSync(path.join(tmpdir(), "export-packet-"));
  const objects = new LocalObjectStore(storageRoot);
  const repository = new PrismaConstructionRepository(db, objects);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const organizationId = `it_export_${suffix}`;

  beforeAll(async () => {
    await db.organization.create({ data: { id: organizationId, name: "Export builder" } });
  });

  afterAll(async () => {
    await rm(storageRoot, { recursive: true, force: true });
    const projects = await db.project.findMany({ where: { organizationId }, select: { id: true } });
    const projectIds = projects.map(({ id }) => id);
    await db.exportPacketDecision.deleteMany({ where: { exportPacket: { projectId: { in: projectIds } } } });
    await db.exportPacket.deleteMany({ where: { projectId: { in: projectIds } } });
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

  it("stores an approved packet linked only to accepted decisions", async () => {
    const project = await createProject(organizationId, { name: "Export bridge" }, repository);
    const document = await createDocument(organizationId, project.id, { title: "Drainage Plan" }, repository);
    const revision = await repository.createRevision({
      documentId: document.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 20,
      sha256: `e${suffix}`.padEnd(64, "0").slice(0, 64),
      storageKey: `revisions/export-${suffix}.pdf`,
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
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, () => new Date("2026-10-01T12:00:00.000Z"));
    const dismissed = await recordReviewDecision(organizationId, project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts[1]!.id },
    }, repository, () => new Date("2026-10-01T12:01:00.000Z"));

    const packet = await exportApprovedChangePacket(organizationId, project.id, {}, repository, () => new Date("2026-10-01T12:05:00.000Z"));
    const stored = await db.exportPacket.findMany({
      where: { projectId: project.id },
      include: { decisions: { orderBy: { ordinal: "asc" } } },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.contentHash).toBe(packet.contentHash);
    expect(stored[0]?.storageKey).toBe(`export-packets/${project.id}/${packet.contentHash}.json`);
    expect(stored[0]?.decisions.map((link) => link.reviewDecisionId)).toEqual([accepted.id]);
    expect(stored[0]?.decisions.map((link) => link.reviewDecisionId)).not.toContain(dismissed.id);
    expect(stored[0]?.payload).toBeNull();
    const payload = await objects.get(stored[0]!.storageKey);
    expect(createHash("sha256").update(payload).digest("hex")).toBe(packet.contentHash);
    expect(JSON.parse(payload.toString("utf8")).changes[0].evidence[0]).toMatchObject({
      pageNumber: 1,
      excerpt: approvedExcerpt,
      revisionId: revision.id,
    });
    const downloaded = await readStoredExportPacket(organizationId, project.id, stored[0]!.id, repository);
    expect(downloaded.payload.equals(payload)).toBe(true);
    expect(downloaded.reviewDecisionIds).toEqual([accepted.id]);

    await objects.delete(stored[0]!.storageKey);
    await db.exportPacket.update({
      where: { id: stored[0]!.id },
      data: { payload: new Uint8Array(payload) },
    });
    const legacy = await repository.getExportPacketById(organizationId, project.id, stored[0]!.id);
    expect(legacy?.payload.equals(payload)).toBe(true);
    await expect(objects.get(stored[0]!.storageKey)).rejects.toMatchObject({ name: "StorageObjectMissingError" });

    expect(await migrateExportPacketPayloads(db, objects, { projectId: project.id })).toEqual({ copied: 1 });
    const migrated = await db.exportPacket.findUniqueOrThrow({ where: { id: stored[0]!.id } });
    expect(migrated.payload).toBeNull();
    expect((await objects.get(migrated.storageKey)).equals(payload)).toBe(true);
    const afterMove = await readStoredExportPacket(organizationId, project.id, migrated.id, repository);
    expect(afterMove.payload.equals(payload)).toBe(true);
    expect(afterMove.contentHash).toBe(packet.contentHash);

    await expect(repository.saveExportPacket({
      organizationId,
      projectId: project.id,
      contentHash: "c".repeat(64),
      storageKey: `export-packets/${project.id}/rejected.json`,
      payload: Buffer.from("{}"),
      reviewDecisionIds: [dismissed.id],
      createdAt: new Date("2026-10-01T12:06:00.000Z"),
    })).rejects.toMatchObject({ message: "Only an approved change can be exported." });
    expect(await db.exportPacket.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("does not store a packet when nothing is approved", async () => {
    const project = await createProject(organizationId, { name: "No approvals" }, repository);
    await expect(exportApprovedChangePacket(organizationId, project.id, {}, repository)).rejects.toMatchObject({
      message: EXPORT_BLOCKED_MESSAGE,
    });
    expect(await db.exportPacket.count({ where: { projectId: project.id } })).toBe(0);
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
