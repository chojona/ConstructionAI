import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import { attachAccPdfChapter, readExportPacketChapter } from "@/lib/review/packetChapters";
import { recordReviewDecision } from "@/lib/review/service";
import { approvedPacketFixture } from "@/tests/support/approvedPacketFixture";
import { deletePacketFixture } from "@/tests/support/deletePacketFixture";

describe("ACC PDF chapter persistence", () => {
  const db = createPrismaClient();
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
    const input = {
      contentHash: fixture.packet.contentHash, decisionId: fixture.decision.id,
      sourceId: "ACC:RFI:42", filename: "rfi-42.pdf", mimeType: "application/pdf", bytes,
    };
    const result = await attachAccPdfChapter(organizationId, projectId, input, repository, objects, () => new Date("2026-10-01T16:00:00.000Z"));
    const row = await db.exportPacket.findUniqueOrThrow({ where: { id: result.stored.id }, include: { decisions: true } });
    expect(row.payload).toBeNull();
    expect(row.decisions.map((link) => link.reviewDecisionId)).toEqual([fixture.decision.id]);
    const reloadedRepository = new PrismaConstructionRepository(db, new LocalObjectStore(root));
    const reread = await readExportPacketChapter(organizationId, projectId, row.id, result.chapter.id, reloadedRepository, new LocalObjectStore(root));
    expect(reread.bytes).toEqual(bytes);
    expect(reread.chapter).toMatchObject({ sourceId: "ACC:RFI:42", fetchedAt: "2026-10-01T16:00:00.000Z", contentHash: result.chapter.contentHash });
    await recordReviewDecision(organizationId, projectId, "Reviewer", {
      decision: "DISMISSED", reason: "Approval withdrawn", subject: { type: "proposed_fact", proposedFactId: fixture.fact.id },
    }, repository, () => new Date("2026-10-01T17:00:00.000Z"));
    await expect(attachAccPdfChapter(organizationId, projectId, input, repository, objects)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await db.exportPacket.count({ where: { projectId } })).toBe(2);
  });
});
