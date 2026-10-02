import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { StorageObjectMissingError, type ObjectStore } from "@/lib/storage/objectStore";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { approvedPacketFixture } from "@/tests/support/approvedPacketFixture";
import { canonicalPacketBytes, packetContentHash } from "./exportPacket";
import { recordReviewDecision } from "./service";
import { attachAccPdfChapter } from "./accChapter";

const bytes = Buffer.from("%PDF-1.4\nACC RFI fixture\n%%EOF");
const fetchedAt = new Date("2026-10-01T16:00:00.000Z");
const upload = {
  sourceId: "urn:adsk.wipprod:dm.lineage:rfi-42",
  filename: "ACC RFI 42.pdf",
  mimeType: "application/pdf",
  bytes,
};

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
  const fixture = await approvedPacketFixture(repository, "org_a");
  const data = new Map<string, Buffer>();
  const objects: ObjectStore = {
    mode: "local",
    put: vi.fn(async (key: string, value: Buffer) => { data.set(key, Buffer.from(value)); }),
    get: vi.fn(async (key: string) => {
      const found = data.get(key);
      if (!found) throw new StorageObjectMissingError(key);
      return Buffer.from(found);
    }),
    delete: vi.fn(async (key: string) => { data.delete(key); }),
    exists: vi.fn(async (key: string) => data.has(key)),
  };
  return { ...fixture, repository, objects, data };
}

describe("ACC PDF export chapters", () => {
  it("attaches exact PDF bytes and provenance to an approved packet", async () => {
    const { project, packet, decision, repository, objects } = await scaffold();
    const result = await attachAccPdfChapter("org_a", project.id, upload, repository, objects, () => fetchedAt);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    expect(result.chapters).toEqual([
      expect.objectContaining({
        role: "acc-docs",
        title: "ACC export",
        sourceId: upload.sourceId,
        fetchedAt: fetchedAt.toISOString(),
        contentHash,
        filename: upload.filename,
        byteSize: bytes.length,
        storageKey: `export-packets/${project.id}/chapters/${contentHash}.pdf`,
      }),
    ]);
    expect(result.changes).toEqual(packet.changes);
    expect(result.decisionIds).toEqual([decision.id]);
    expect(result.contentHash).not.toBe(packet.contentHash);
    expect(result.contentHash).toBe(packetContentHash(result));
    expect(repository.exportPackets).toHaveLength(2);
    expect(repository.exportPackets[0]?.contentHash).toBe(packet.contentHash);
    expect(await objects.get(result.chapters![0]!.storageKey)).toEqual(bytes);
    expect(repository.exportPacketChapters[0]?.reviewDecisionIds).toEqual([decision.id]);
  });

  it("preserves earlier chapters when attaching another PDF", async () => {
    const { project, repository, objects } = await scaffold();
    const first = await attachAccPdfChapter("org_a", project.id, upload, repository, objects, () => fetchedAt);
    const secondBytes = Buffer.from("%PDF-1.4\nsecond\n%%EOF");
    const second = await attachAccPdfChapter("org_a", project.id, {
      ...upload,
      sourceId: "acc-doc-43",
      filename: "second.pdf",
      bytes: secondBytes,
    }, repository, objects, () => fetchedAt);
    expect(second.chapters).toHaveLength(2);
    expect(second.chapters).toEqual(expect.arrayContaining([first.chapters![0]]));
    expect(second.chapters?.map((chapter) => chapter.sourceId)).toEqual(["acc-doc-43", upload.sourceId]);
  });

  it("keeps historical packet hashes compatible when there are no chapters", async () => {
    const { packet } = await scaffold();
    const { kind, version, projectId, note, decisionIds, changes } = packet;
    const historical = Buffer.from(JSON.stringify({ kind, version, projectId, note, decisionIds, changes }));
    expect(canonicalPacketBytes(packet)).toEqual(historical);
  });

  it.each(["DISMISSED", "FLAGGED"] as const)("blocks attachment after approval is superseded by %s", async (decision) => {
    const { project, fact, repository, objects } = await scaffold();
    await recordReviewDecision("org_a", project.id, "Reviewer", {
      decision,
      reason: "Needs correction",
      subject: { type: "proposed_fact", proposedFactId: fact.id },
    }, repository, () => fetchedAt);
    await expect(attachAccPdfChapter("org_a", project.id, upload, repository, objects)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(objects.put).not.toHaveBeenCalled();
    expect(repository.exportPackets).toHaveLength(1);
  });

  it("rejects a missing change and a project outside the organization before storing bytes", async () => {
    const { project, repository, objects } = await scaffold();
    await expect(attachAccPdfChapter("org_a", project.id, {
      ...upload,
      subjectKey: "proposed-fact:missing",
    }, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(attachAccPdfChapter("org_b", project.id, upload, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(attachAccPdfChapter("org_a", "other-project", upload, repository, objects)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(objects.put).not.toHaveBeenCalled();
  });

  it("rejects an invalid PDF before storing bytes and keeps a blank source id as an upload marker", async () => {
    const { project, repository, objects } = await scaffold();
    await expect(attachAccPdfChapter("org_a", project.id, {
      ...upload,
      bytes: Buffer.from("not a PDF"),
    }, repository, objects)).rejects.toMatchObject({ code: "NOT_PDF" });
    expect(objects.put).not.toHaveBeenCalled();
    const stored = await attachAccPdfChapter("org_a", project.id, {
      ...upload,
      sourceId: " ",
    }, repository, objects, () => fetchedAt);
    expect(stored.chapters?.[0]?.sourceId).toBe(`upload:${createHash("sha256").update(bytes).digest("hex")}`);
    expect(objects.put).toHaveBeenCalledTimes(1);
  });
});
