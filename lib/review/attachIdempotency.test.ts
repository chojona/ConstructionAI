import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { approvedPacketFixture } from "@/tests/support/approvedPacketFixture";
import { attachAccPdfChapter } from "./accChapter";
import { attachBluebeamMarkupAppendix } from "./bluebeamAppendix";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("sha256 attach idempotency", () => {
  it("returns the existing ACC chapter when the same bytes are attached again", async () => {
    const { repository, project, objects } = await scaffold();
    const pdf = buildTextPdf(["RFI 42 — trench detail"]);
    const fetchedAt = new Date("2026-10-02T01:00:00.000Z");
    const contentHash = createHash("sha256").update(pdf).digest("hex");

    await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
      role: "acc-docs",
    }, repository, objects, () => fetchedAt);
    const existing = repository.exportPacketChapters[0]!;

    const again = await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "rfi-42-copy.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-9999",
      role: "acc-docs",
    }, repository, objects, () => new Date("2026-10-03T00:00:00.000Z"));

    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.exportPacketChapters[0]?.id).toBe(existing.id);
    expect(repository.exportPacketChapters[0]).toMatchObject({
      sourceId: "acc-doc-8841",
      fetchedAt,
      contentHash,
      filename: "rfi-42.pdf",
      role: "acc-docs",
    });
    expect(again.chapters).toEqual([
      expect.objectContaining({
        sourceId: "acc-doc-8841",
        fetchedAt: fetchedAt.toISOString(),
        contentHash,
        filename: "rfi-42.pdf",
        role: "acc-docs",
      }),
    ]);
  });

  it("stores a second ACC chapter when the bytes differ", async () => {
    const { repository, project, objects } = await scaffold();
    const first = buildTextPdf(["RFI 42 — trench detail"]);
    const second = buildTextPdf(["RFI 43 — a different sheet"]);
    await attachAccPdfChapter("org_a", project.id, {
      bytes: first,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
    }, repository, objects, () => new Date("2026-10-02T01:00:00.000Z"));

    const packet = await attachAccPdfChapter("org_a", project.id, {
      bytes: second,
      filename: "rfi-43.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
    }, repository, objects, () => new Date("2026-10-02T02:00:00.000Z"));

    expect(repository.exportPacketChapters).toHaveLength(2);
    expect(packet.chapters).toHaveLength(2);
    expect(new Set(packet.chapters?.map((chapter) => chapter.contentHash)).size).toBe(2);
  });

  it("returns the existing markup appendix when the same bytes are attached again", async () => {
    const { repository, project, packet, objects } = await scaffold();
    const pdf = buildTextPdf(["Markup Summary", "Page: 2", "Page: 14"]);
    const fetchedAt = new Date("2026-10-02T04:00:00.000Z");
    const contentHash = createHash("sha256").update(pdf).digest("hex");

    await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
    }, repository, objects, () => fetchedAt);
    const existing = repository.exportPacketChapters[0]!;

    const again = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary-copy.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-99",
    }, repository, objects, () => new Date("2026-10-03T04:00:00.000Z"));

    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.exportPacketChapters[0]?.id).toBe(existing.id);
    const pin = packet.changes[0]!.evidence[0]!;
    const unpinned = (label: string) => ({
      status: "Unpinned" as const,
      label,
      display: label,
      reason: `page not in Rev ${pin.revisionLabel}`,
      revisionId: pin.revisionId,
      revisionLabel: pin.revisionLabel,
    });
    expect(repository.exportPacketChapters[0]).toMatchObject({
      role: "bluebeam-markup",
      sourceId: "bb-summary-17",
      fetchedAt,
      contentHash,
      filename: "markup-summary.pdf",
      pageCites: [unpinned("2"), unpinned("14")],
    });
    expect(again.appendices).toEqual([
      expect.objectContaining({
        sourceId: "bb-summary-17",
        fetchedAt: fetchedAt.toISOString(),
        contentHash,
        filename: "markup-summary.pdf",
        pageCites: [unpinned("2"), unpinned("14")],
      }),
    ]);
    expect(again.chapters).toBeUndefined();
  });

  it("stores a second markup appendix when the bytes differ", async () => {
    const { repository, project, objects } = await scaffold();
    const first = buildTextPdf(["Markup Summary", "Page: 2"]);
    const second = buildTextPdf(["Markup Summary", "Page: 9"]);
    await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: first,
      filename: "first.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
    }, repository, objects, () => new Date("2026-10-02T04:00:00.000Z"));

    const packet = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: second,
      filename: "second.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
    }, repository, objects, () => new Date("2026-10-02T05:00:00.000Z"));

    expect(repository.exportPacketChapters).toHaveLength(2);
    expect(packet.appendices).toHaveLength(2);
    expect(new Set(packet.appendices?.map((appendix) => appendix.contentHash)).size).toBe(2);
  });

  it("keeps a chapter and an appendix when the same bytes are attached as each", async () => {
    const { repository, project, objects } = await scaffold();
    const pdf = buildTextPdf(["Markup Summary", "Page: 2", "Page: 14"]);
    await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
    }, repository, objects, () => new Date("2026-10-02T01:00:00.000Z"));
    const packet = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
    }, repository, objects, () => new Date("2026-10-02T02:00:00.000Z"));

    expect(repository.exportPacketChapters).toHaveLength(2);
    expect(packet.chapters).toHaveLength(1);
    expect(packet.appendices).toHaveLength(1);
    expect(packet.chapters?.[0]?.contentHash).toBe(packet.appendices?.[0]?.contentHash);
  });

  it("keeps the same bytes as a separate row on another project's pack", async () => {
    const { repository, project, objects } = await scaffold();
    repository.addOrganization("org_b");
    const other = await approvedPacketFixture(repository, "org_b");
    const pdf = buildTextPdf(["RFI 42 — trench detail"]);

    await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
    }, repository, objects, () => new Date("2026-10-02T01:00:00.000Z"));
    await attachAccPdfChapter("org_b", other.project.id, {
      bytes: pdf,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-other-org",
    }, repository, objects, () => new Date("2026-10-02T02:00:00.000Z"));

    expect(repository.exportPacketChapters).toHaveLength(2);
    expect(repository.exportPacketChapters.map((chapter) => chapter.projectId).sort()).toEqual(
      [project.id, other.project.id].sort(),
    );
  });
});

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  const fixture = await approvedPacketFixture(repository, "org_a");
  const root = mkdtempSync(path.join(tmpdir(), "attach-idempotency-"));
  roots.push(root);
  return { repository, project: fixture.project, packet: fixture.packet, objects: new LocalObjectStore(root) };
}
