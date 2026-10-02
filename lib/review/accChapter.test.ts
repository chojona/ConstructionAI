import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { attachAccPdfChapter } from "./accChapter";
import {
  ADD_ACC_EXPORT_LABEL,
  ACC_CHAPTER_ADDED_MESSAGE,
  ACC_CHAPTER_FILE_LABEL,
  ACC_CHAPTER_SOURCE_LABEL,
  ACC_EXPORT_CHAPTER_TITLE,
  EXPORT_BLOCKED_MESSAGE,
  RFI_PDF_CHAPTER_TITLE,
  accChapterAttachVisible,
} from "./exportPacketView";
import { exportApprovedChangePacket, recordReviewDecision } from "./service";

const BANNED_COPY = /\b(dsc|fa|force account|force-account|change orders?|co|pco|entitlement|candidate|unpaid|claim|detection)\b/i;

const trench = "A CAT 336 excavator shall be used for the trench.";
const dozer = "A dozer shall be used.";
const pump = "A pump shall dewater the excavation.";
const loader = "A loader shall stockpile the spoil.";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ACC PDF pack chapter", () => {
  it("uses approved-pack copy and stays hidden until a change is approved", () => {
    expect(accChapterAttachVisible(0)).toBe(false);
    expect(accChapterAttachVisible(1)).toBe(true);
    expect(ADD_ACC_EXPORT_LABEL).toBe("Add pack chapter");
    expect(ACC_CHAPTER_FILE_LABEL).toBe("PDF");
    expect(ACC_CHAPTER_SOURCE_LABEL).toBe("Source id");
    expect(ACC_EXPORT_CHAPTER_TITLE).toBe("ACC export");
    expect(RFI_PDF_CHAPTER_TITLE).toBe("RFI PDF");
    expect(ACC_CHAPTER_ADDED_MESSAGE).toBe("Pack chapter added.");
    const copy = [
      ADD_ACC_EXPORT_LABEL,
      ACC_CHAPTER_FILE_LABEL,
      ACC_CHAPTER_SOURCE_LABEL,
      ACC_EXPORT_CHAPTER_TITLE,
      RFI_PDF_CHAPTER_TITLE,
      ACC_CHAPTER_ADDED_MESSAGE,
      "Pack chapter",
    ].join("\n");
    expect(copy).not.toMatch(BANNED_COPY);
    const view = readFileSync("components/review/export-packet.tsx", "utf8");
    const copySource = `${view}\n${readFileSync("lib/review/exportPacketView.ts", "utf8")}`;
    expect(copySource).toContain(ADD_ACC_EXPORT_LABEL);
    expect(copySource).toContain(ACC_CHAPTER_FILE_LABEL);
    expect(copySource).toContain("Pack chapter");
    expect(view).not.toMatch(BANNED_COPY);
    expect(copySource).not.toMatch(BANNED_COPY);
    expect(view).not.toMatch(/node:crypto|@\/lib\/storage\/objectStore|@aws-sdk\/client-s3/);
    const server = readFileSync("lib/review/accChapter.ts", "utf8");
    expect(server).not.toMatch(/S3Client|public-read|PutObjectCommand|new S3/);
    expect(server).toMatch(/writePacketBytes|ObjectStore/);
  });

  it("attaches an ACC PDF as a chapter of an accepted pack with provenance in the object store", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts.dozer.id },
    }, repository, clock);
    const decisionsBefore = repository.reviewDecisions.length;
    const pdf = buildTextPdf(["RFI 42 — trench detail"]);
    const fetchedAt = new Date("2026-10-02T01:00:00.000Z");

    const packet = await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
      role: "acc-docs",
    }, repository, objects, () => fetchedAt);

    const contentHash = createHash("sha256").update(pdf).digest("hex");
    expect(packet.decisionIds).toEqual([accepted.id]);
    expect(packet.chapters).toEqual([
      {
        role: "acc-docs",
        title: "ACC export",
        sourceId: "acc-doc-8841",
        fetchedAt: fetchedAt.toISOString(),
        contentHash,
        storageKey: `export-packets/${project.id}/chapters/${contentHash}.pdf`,
        filename: "rfi-42.pdf",
        byteSize: pdf.byteLength,
      },
    ]);
    expect(packet.contentHash).toHaveLength(64);
    expect(JSON.stringify(packet)).not.toMatch(BANNED_COPY);
    expect(JSON.stringify(packet)).not.toContain(pdf.toString("latin1"));
    expect(await objects.get(packet.chapters![0]!.storageKey)).toEqual(pdf);
    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.exportPacketChapters[0]).toMatchObject({
      sourceId: "acc-doc-8841",
      fetchedAt,
      contentHash,
      reviewDecisionIds: [accepted.id],
    });
    expect(repository.reviewDecisions).toHaveLength(decisionsBefore);
    expect(repository.emailSends).toHaveLength(0);

    const exported = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => fetchedAt);
    expect(exported.contentHash).toBe(packet.contentHash);
    expect(exported.chapters).toEqual(packet.chapters);
    expect(repository.exportPackets).toHaveLength(1);

    const again = await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "rfi-42.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-8841",
    }, repository, objects, () => new Date("2026-10-03T00:00:00.000Z"));
    expect(again.contentHash).toBe(packet.contentHash);
    expect(again.chapters?.[0]?.fetchedAt).toBe(fetchedAt.toISOString());
    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.exportPackets).toHaveLength(1);
  });

  it("stores an RFI PDF under an upload marker when no source id is given", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, sequencedClock());
    const pdf = buildTextPdf(["Request for information"]);

    const packet = await attachAccPdfChapter("org_a", project.id, {
      bytes: pdf,
      filename: "../secret/rfi.pdf",
      mimeType: "application/pdf",
      role: "rfi",
      subjectKey: accepted.subjectKey,
    }, repository, objects, () => new Date("2026-10-02T02:00:00.000Z"));

    const contentHash = createHash("sha256").update(pdf).digest("hex");
    expect(packet.chapters).toEqual([
      expect.objectContaining({
        role: "rfi",
        title: "RFI PDF",
        sourceId: `upload:${contentHash}`,
        contentHash,
        filename: "rfi.pdf",
        storageKey: `export-packets/${project.id}/chapters/${contentHash}.pdf`,
      }),
    ]);
    expect(packet.chapters?.[0]?.storageKey.startsWith(`export-packets/${project.id}/chapters/`)).toBe(true);
    expect(await objects.get(packet.chapters![0]!.storageKey)).toEqual(pdf);
  });

  it("rejects a chapter when the change is pending, flagged, or rejected and stores nothing", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    const rejected = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts.dozer.id },
    }, repository, clock);
    const flagged = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "FLAGGED",
      reason: "Ask the superintendent.",
      subject: { type: "proposed_fact", proposedFactId: facts.pump.id },
    }, repository, clock);
    const pdf = chapterPdf();
    const input = {
      bytes: pdf,
      filename: "acc.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-1",
    };

    await expect(attachAccPdfChapter("org_a", project.id, input, repository, objects, clock)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: EXPORT_BLOCKED_MESSAGE,
    });
    await expect(attachAccPdfChapter("org_a", project.id, {
      ...input,
      subjectKey: rejected.subjectKey,
    }, repository, objects, clock)).rejects.toMatchObject({
      message: "Only an approved change can be exported.",
    });
    await expect(attachAccPdfChapter("org_a", project.id, {
      ...input,
      subjectKey: flagged.subjectKey,
    }, repository, objects, clock)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const reviewOpen = `proposed-fact:${facts.loader.id}`;
    await expect(attachAccPdfChapter("org_a", project.id, {
      ...input,
      subjectKey: reviewOpen,
    }, repository, objects, clock)).rejects.toMatchObject({
      message: "Only an approved change can be exported.",
    });
    expect(repository.exportPacketChapters).toHaveLength(0);
    expect(repository.exportPackets).toHaveLength(0);
    expect(repository.emailSends).toHaveLength(0);
    expect(await objects.exists(`export-packets/${project.id}/chapters/${createHash("sha256").update(pdf).digest("hex")}.pdf`)).toBe(false);
  });

  it("does not store a file that is not a PDF", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, sequencedClock());
    await expect(attachAccPdfChapter("org_a", project.id, {
      bytes: Buffer.from("not a pdf"),
      filename: "notes.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-2",
    }, repository, objects, () => new Date("2026-10-02T04:00:00.000Z"))).rejects.toMatchObject({
      code: "NOT_PDF",
    });
    expect(repository.exportPacketChapters).toHaveLength(0);
    expect(repository.exportPackets).toHaveLength(0);
  });

  it("skips a chapter after approval is superseded and does not keep it on the next pack", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await attachAccPdfChapter("org_a", project.id, {
      bytes: chapterPdf(),
      filename: "acc.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-9",
    }, repository, objects, () => new Date("2026-10-02T03:00:00.000Z"));
    await recordReviewDecision("org_a", project.id, "pm-2", {
      decision: "DISMISSED",
      reason: "Superseded on site.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);

    await expect(attachAccPdfChapter("org_a", project.id, {
      bytes: chapterPdf(),
      filename: "acc.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-9",
      subjectKey: accepted.subjectKey,
    }, repository, objects, clock)).rejects.toMatchObject({
      message: "Only an approved change can be exported.",
    });
    await expect(exportApprovedChangePacket("org_a", project.id, {}, repository, clock)).rejects.toMatchObject({
      message: EXPORT_BLOCKED_MESSAGE,
    });
    expect(repository.exportPacketChapters).toHaveLength(1);
  });

  it("skips a chapter tied to a decision that is no longer accepted", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const pump = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.pump.id },
    }, repository, clock);
    await attachAccPdfChapter("org_a", project.id, {
      bytes: chapterPdf(),
      filename: "acc.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-both",
    }, repository, objects, () => new Date("2026-10-02T05:00:00.000Z"));
    await recordReviewDecision("org_a", project.id, "pm-2", {
      decision: "DISMISSED",
      reason: "Superseded on site.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);

    const exported = await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    expect(exported.decisionIds).toEqual([pump.id]);
    expect(exported.chapters).toBeUndefined();

    const again = await attachAccPdfChapter("org_a", project.id, {
      bytes: chapterPdf(),
      filename: "acc.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-both",
    }, repository, objects, () => new Date("2026-10-02T06:00:00.000Z"));
    expect(again.decisionIds).toEqual([pump.id]);
    expect(again.chapters?.[0]).toMatchObject({
      sourceId: "acc-doc-both",
      fetchedAt: "2026-10-02T05:00:00.000Z",
    });
    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.exportPacketChapters[0]?.reviewDecisionIds).toEqual([pump.id]);
  });
});

function objectStore() {
  const root = mkdtempSync(path.join(tmpdir(), "acc-chapter-"));
  roots.push(root);
  return new LocalObjectStore(root);
}

function chapterPdf() {
  return buildTextPdf(["ACC export sheet"]);
}

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
  const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Drainage Plan" });
  const revision = await repository.createRevision({
    documentId: document!.id,
    revisionLabel: "A",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    byteSize: 10,
    sha256: "a".repeat(64),
    storageKey: "revisions/a.pdf",
    status: "PROCESSED",
    pages: [{ pageNumber: 1, text: [trench, dozer, pump, loader].join("\n"), textSha256: "c".repeat(64) }],
  });
  const stored = await propose(repository, revision.id, [
    equipmentFact(trench, "CAT 336"),
    equipmentFact(dozer, "dozer"),
    equipmentFact(pump, "pump"),
    equipmentFact(loader, "loader"),
  ]);
  return {
    repository,
    project: { id: project.id, documentId: document!.id, revisionId: revision.id },
    facts: {
      trench: stored[0]!,
      dozer: stored[1]!,
      pump: stored[2]!,
      loader: stored[3]!,
    },
  };
}

async function propose(
  repository: MemoryRepository,
  documentRevisionId: string,
  facts: Array<{ factType: "equipment_requirement"; payload: Record<string, string | null>; excerpt: string }>,
) {
  const revision = await repository.getRevision("org_a", documentRevisionId);
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  if (!queued || !revision) throw new Error("Missing extraction run");
  await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
  });
  await repository.commitProposedFacts({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "RUNNING",
    completedAt: new Date("2026-09-30T18:00:00.000Z"),
    facts: facts.map((fact) => ({
      factType: fact.factType,
      payload: fact.payload,
      evidence: [{
        documentPageId: revision.pages[0]!.id,
        pageNumber: 1,
        excerpt: fact.excerpt,
        startOffset: 0,
        endOffset: fact.excerpt.length,
      }],
    })),
  });
  return repository.proposedFacts.filter((fact) => fact.extractionRunId === queued.id);
}

function equipmentFact(excerpt: string, equipment: string) {
  return {
    factType: "equipment_requirement" as const,
    excerpt,
    payload: { equipment, statement: excerpt, modality: "asserted" },
  };
}

function sequencedClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 30, 12, tick++));
}
