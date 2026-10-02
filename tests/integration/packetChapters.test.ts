import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import { attachAccPdfChapter } from "@/lib/review/accChapter";
import { recordReviewDecision } from "@/lib/review/service";
import { approvedPacketFixture } from "@/tests/support/approvedPacketFixture";
import { deletePacketFixture } from "@/tests/support/deletePacketFixture";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

describe.skipIf(!hasIntegrationDatabase)("ACC PDF chapter persistence", () => {
  const db = integrationDb();
  const organizationId = `it_acc_chapter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let root = "";
  let projectId = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "acc-chapters-"));
    await db.organization.create({ data: { id: organizationId, name: "ACC chapter QA" } });
  });

  afterAll(async () => {
    if (projectId) await deletePacketFixture(db, projectId);
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.$disconnect();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("persists PDF chapters through a new repository and refuses superseded approval", async () => {
    const objects = new LocalObjectStore(root);
    const repository = new PrismaConstructionRepository(db, objects);
    const fixture = await approvedPacketFixture(repository, organizationId);
    projectId = fixture.project.id;
    const bytes = Buffer.from("%PDF-1.4\nACC RFI fixture\n%%EOF");
    const fetchedAt = new Date("2026-10-01T16:00:00.000Z");
    const result = await attachAccPdfChapter(organizationId, projectId, {
      sourceId: "ACC:RFI:42",
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      bytes,
    }, repository, objects, () => fetchedAt);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    expect(result.chapters?.[0]).toMatchObject({
      sourceId: "ACC:RFI:42",
      fetchedAt: fetchedAt.toISOString(),
      contentHash,
      filename: "rfi-42.pdf",
    });
    const row = await db.exportPacket.findFirstOrThrow({
      where: { projectId, contentHash: result.contentHash },
      include: { decisions: true },
    });
    expect(row.payload).toBeNull();
    expect(row.decisions.map((link) => link.reviewDecisionId)).toEqual([fixture.decision.id]);
    const reread = await new LocalObjectStore(root).get(result.chapters![0]!.storageKey);
    expect(reread).toEqual(bytes);
    await recordReviewDecision(organizationId, projectId, "Reviewer", {
      decision: "DISMISSED",
      reason: "Approval withdrawn",
      subject: { type: "proposed_fact", proposedFactId: fixture.fact.id },
    }, repository, () => new Date("2026-10-01T17:00:00.000Z"));
    await expect(attachAccPdfChapter(organizationId, projectId, {
      sourceId: "ACC:RFI:42",
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      bytes,
    }, repository, objects)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await db.exportPacket.count({ where: { projectId } })).toBe(2);
  });
});
