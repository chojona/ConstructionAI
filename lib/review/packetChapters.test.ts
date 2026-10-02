import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { approvedPacketFixture } from "@/tests/support/approvedPacketFixture";
import type { ObjectStore } from "@/lib/storage/objectStore";
import { canonicalPacketBytes, packetContentHash, packetFromStored } from "./exportPacket";
import { recordReviewDecision } from "./service";
import { attachAccPdfChapter, readExportPacketChapter } from "./packetChapters";

const bytes = Buffer.from("%PDF-1.4\nACC RFI fixture\n%%EOF");
const fetchedAt = new Date("2026-10-01T16:00:00.000Z");
const upload = { sourceId: "urn:adsk.wipprod:dm.lineage:rfi-42", filename: "ACC RFI 42.pdf", mimeType: "application/pdf", bytes };

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
  const fixture = await approvedPacketFixture(repository, "org_a");
  const data = new Map<string, Buffer>();
  const objects: ObjectStore = {
    mode: "local",
    put: vi.fn(async (key, value) => { data.set(key, Buffer.from(value)); }),
    get: vi.fn(async (key) => Buffer.from(data.get(key)!)),
    delete: vi.fn(async (key) => { data.delete(key); }),
    exists: vi.fn(async (key) => data.has(key)),
  };
  const input = { ...upload, contentHash: fixture.packet.contentHash, decisionId: fixture.decision.id };
  return { ...fixture, repository, objects, input, data };
}

describe("ACC PDF export chapters", () => {
  it("attaches exact PDF bytes and provenance to an immutable approved packet", async () => {
    const { project, packet, decision, repository, objects, input } = await scaffold();
    const result = await attachAccPdfChapter("org_a", project.id, input, repository, objects, () => fetchedAt);
    expect(result.chapter).toMatchObject({
      source: "ACC", sourceId: upload.sourceId, fetchedAt: fetchedAt.toISOString(),
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      filename: upload.filename, mimeType: "application/pdf", byteSize: bytes.length, decisionId: decision.id,
    });
    expect(result.packet.chapters).toEqual([result.chapter]);
    expect(result.packet.changes).toEqual(packet.changes);
    expect(result.stored.reviewDecisionIds).toEqual([decision.id]);
    expect(result.packet.contentHash).not.toBe(packet.contentHash);
    expect(result.packet.contentHash).toBe(packetContentHash(result.packet));
    expect(packetFromStored(result.stored).chapters).toEqual([result.chapter]);
    expect(repository.exportPackets).toHaveLength(2);
    expect(packetFromStored(repository.exportPackets[0]!).chapters).toBeUndefined();
    const downloaded = await readExportPacketChapter("org_a", project.id, result.stored.id, result.chapter.id, repository, objects);
    expect(downloaded.bytes).toEqual(bytes);
  });

  it("preserves earlier chapters when attaching another PDF", async () => {
    const { project, repository, objects, input } = await scaffold();
    const first = await attachAccPdfChapter("org_a", project.id, input, repository, objects, () => fetchedAt);
    const second = await attachAccPdfChapter("org_a", project.id, {
      ...input, contentHash: first.packet.contentHash, sourceId: "ACC-document-43", bytes: Buffer.from("%PDF-1.4\nsecond\n%%EOF"),
    }, repository, objects, () => fetchedAt);
    expect(second.packet.chapters).toHaveLength(2);
    expect(second.packet.chapters?.[0]).toEqual(first.chapter);
  });

  it("keeps historical packet hashes compatible when there are no chapters", async () => {
    const { packet } = await scaffold();
    const { kind, version, projectId, note, decisionIds, changes } = packet;
    const historical = Buffer.from(JSON.stringify({ kind, version, projectId, note, decisionIds, changes }));
    expect(canonicalPacketBytes(packet)).toEqual(historical);
  });

  it.each(["DISMISSED", "FLAGGED"] as const)("blocks attachment after approval is superseded by %s", async (decision) => {
    const { project, fact, repository, objects, input } = await scaffold();
    await recordReviewDecision("org_a", project.id, "Reviewer", {
      decision, reason: "Needs correction", subject: { type: "proposed_fact", proposedFactId: fact.id },
    }, repository, () => fetchedAt);
    await expect(attachAccPdfChapter("org_a", project.id, input, repository, objects)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(objects.put).not.toHaveBeenCalled();
    expect(repository.exportPackets).toHaveLength(1);
  });

  it("rejects a decision outside the approved pack and a nonexistent draft pack", async () => {
    const { project, repository, objects, input } = await scaffold();
    await expect(attachAccPdfChapter("org_a", project.id, { ...input, decisionId: "unapproved" }, repository, objects)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(attachAccPdfChapter("org_a", project.id, { ...input, contentHash: "d".repeat(64) }, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(objects.put).not.toHaveBeenCalled();
  });

  it("scopes attachment and download to organization and project", async () => {
    const { project, repository, objects, input } = await scaffold();
    await expect(attachAccPdfChapter("org_b", project.id, input, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(attachAccPdfChapter("org_a", "other-project", input, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(objects.put).not.toHaveBeenCalled();
    const result = await attachAccPdfChapter("org_a", project.id, input, repository, objects);
    await expect(readExportPacketChapter("org_b", project.id, result.stored.id, result.chapter.id, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(readExportPacketChapter("org_a", "other-project", result.stored.id, result.chapter.id, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(readExportPacketChapter("org_a", project.id, result.stored.id, "missing", repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid PDFs and missing source ids before storing bytes", async () => {
    const { project, repository, objects, input } = await scaffold();
    await expect(attachAccPdfChapter("org_a", project.id, { ...input, bytes: Buffer.from("not a PDF") }, repository, objects)).rejects.toMatchObject({ code: "NOT_PDF" });
    await expect(attachAccPdfChapter("org_a", project.id, { ...input, sourceId: " " }, repository, objects)).rejects.toThrow();
    expect(objects.put).not.toHaveBeenCalled();
  });

  it("rejects corrupted PDF bytes on download", async () => {
    const { project, repository, objects, input, data } = await scaffold();
    const result = await attachAccPdfChapter("org_a", project.id, input, repository, objects);
    data.set(result.chapter.storageKey, Buffer.from("corrupt"));
    await expect(readExportPacketChapter("org_a", project.id, result.stored.id, result.chapter.id, repository, objects)).rejects.toMatchObject({ code: "STORAGE_ERROR" });
  });
});
