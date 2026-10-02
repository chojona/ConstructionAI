import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { StorageObjectMissingError, type ObjectStore } from "@/lib/storage/objectStore";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { attachAccPdfChapter } from "./accChapter";
import { attachBluebeamMarkupAppendix } from "./bluebeamAppendix";
import {
  APPROVED_CHANGE_PACKET_KIND,
  APPROVED_CHANGE_PACKET_NOTE,
  APPROVED_CHANGE_PACKET_VERSION,
  canonicalPacketBytes,
  packetContentHash,
  type ApprovedChangePacketItem,
  type ExportPacketAppendix,
  type ExportPacketCanonical,
  type ExportPacketChapter,
} from "./exportPacket";
import { exportApprovedChangePacket, readStoredExportPacket, recordReviewDecision } from "./service";

const trench = "A CAT 336 excavator shall be used for the trench.";
const pump = "A pump shall dewater the excavation.";

describe("export packet content hash", () => {
  it("hashes the same canonical inputs to the same sha256, including chapter and appendix bytes", () => {
    const packet = canonical();
    const reversed: ExportPacketCanonical = {
      ...packet,
      chapters: [...(packet.chapters ?? [])].reverse(),
      appendices: [...(packet.appendices ?? [])].reverse(),
      changes: packet.changes.map((change) => ({ ...change, evidence: change.evidence.map((item) => ({ ...item })) })),
    };

    expect(packetContentHash(packet)).toBe(packetContentHash(reversed));
    expect(packetContentHash(packet)).toHaveLength(64);
    expect(packetContentHash(packet)).toBe(createHash("sha256").update(canonicalPacketBytes(packet)).digest("hex"));

    const changedChapter = canonical();
    changedChapter.chapters![0]!.contentHash = "c".repeat(64);
    const changedAppendix = canonical();
    changedAppendix.appendices![0]!.contentHash = "d".repeat(64);
    const changedDecision = canonical();
    changedDecision.decisionIds = ["decision_2"];
    changedDecision.changes[0]!.decisionId = "decision_2";

    expect(packetContentHash(changedChapter)).not.toBe(packetContentHash(packet));
    expect(packetContentHash(changedAppendix)).not.toBe(packetContentHash(packet));
    expect(packetContentHash(changedDecision)).not.toBe(packetContentHash(packet));
  });
});

describe("frozen export snapshot", () => {
  it("returns the stored snapshot after chapter, appendix, and decision rows change", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, sequencedClock());

    const exportedAt = new Date("2026-10-01T20:00:00.000Z");
    const frozen = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => exportedAt);
    const originalPayload = Buffer.from(repository.exportPackets[0]!.payload);
    const chapterPdf = buildTextPdf(["ACC chapter"]);
    const withChapter = await attachAccPdfChapter("org_a", project.id, {
      bytes: chapterPdf,
      filename: "acc.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-1",
    }, repository, objects, () => new Date("2026-10-01T21:00:00.000Z"));
    const appendixPdf = buildTextPdf(["Markup Summary", "Page: 2"]);
    const withAppendix = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: appendixPdf,
      filename: "markup.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-1",
    }, repository, objects, () => new Date("2026-10-01T22:00:00.000Z"));

    expect(withChapter.contentHash).not.toBe(frozen.contentHash);
    expect(withAppendix.contentHash).not.toBe(withChapter.contentHash);
    expect(repository.exportPackets).toHaveLength(3);
    expect(repository.exportPackets[0]!.payload.equals(originalPayload)).toBe(true);
    expect(repository.exportPackets[0]!.contentHash).toBe(frozen.contentHash);

    const chapterPayload = Buffer.from(repository.exportPackets[1]!.payload);
    const appendixPayload = Buffer.from(repository.exportPackets[2]!.payload);
    repository.exportPacketChapters[0]!.filename = "mutated-chapter.pdf";
    repository.exportPacketChapters[0]!.byteSize = 1;
    repository.exportPacketChapters[1]!.filename = "mutated-appendix.pdf";
    repository.exportPacketChapters[1]!.pageCites = ["99"];
    repository.reviewDecisions[0]!.reason = "Changed after the pack was exported.";
    repository.documents[0]!.title = "Renamed plan";
    repository.proposedFacts[0]!.payload = {
      ...repository.proposedFacts[0]!.payload,
      equipment: "MUTATED",
    };

    const again = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => new Date("2026-10-03T00:00:00.000Z"));
    expect(again.contentHash).toBe(withAppendix.contentHash);
    expect(again.generatedAt).toBe(withAppendix.generatedAt);
    expect(again.changes[0]?.document.title).toBe("Drainage Plan");
    expect(again.changes[0]?.reason).toBe("Confirmed on sheet C-101.");
    expect(again.changes[0]?.summary).toContain("CAT 336");
    expect(again.chapters?.[0]?.filename).toBe("acc.pdf");
    expect(again.appendices?.[0]?.pageCites).toEqual(["2"]);
    expect(again.appendices?.[0]?.filename).toBe("markup.pdf");
    expect(repository.exportPackets).toHaveLength(3);
    expect(repository.exportPackets[0]!.payload.equals(originalPayload)).toBe(true);
    expect(repository.exportPackets[1]!.payload.equals(chapterPayload)).toBe(true);
    expect(repository.exportPackets[2]!.payload.equals(appendixPayload)).toBe(true);

    const downloaded = await readStoredExportPacket("org_a", project.id, repository.exportPackets[0]!.id, repository);
    const latest = await readStoredExportPacket("org_a", project.id, repository.exportPackets[2]!.id, repository);
    expect(downloaded.payload.equals(originalPayload)).toBe(true);
    expect(downloaded.contentHash).toBe(frozen.contentHash);
    expect(latest.payload.equals(appendixPayload)).toBe(true);
    expect(latest.contentHash).toBe(withAppendix.contentHash);
    expect(accepted.id).toBe(frozen.decisionIds[0]);
  });

  it("stores a new snapshot after another approval and leaves the earlier pack unchanged", async () => {
    const { repository, project, facts } = await scaffold();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const first = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => new Date("2026-10-01T20:00:00.000Z"));
    const originalPayload = Buffer.from(repository.exportPackets[0]!.payload);
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.pump.id },
    }, repository, clock);

    const second = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => new Date("2026-10-01T21:00:00.000Z"));
    expect(second.decisionIds).toHaveLength(2);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(repository.exportPackets).toHaveLength(2);
    expect(repository.exportPackets[0]!.payload.equals(originalPayload)).toBe(true);
    expect(repository.exportPackets[0]!.contentHash).toBe(first.contentHash);
  });
});

function canonical(): ExportPacketCanonical {
  const first = change("decision_1");
  return {
    kind: APPROVED_CHANGE_PACKET_KIND,
    version: APPROVED_CHANGE_PACKET_VERSION,
    projectId: "project_1",
    note: APPROVED_CHANGE_PACKET_NOTE,
    decisionIds: [first.decisionId],
    changes: [first],
    chapters: [chapter("rfi", "rfi-1", "a".repeat(64)), chapter("acc-docs", "acc-1", "b".repeat(64))],
    appendices: [appendix("bb-2", "e".repeat(64)), appendix("bb-1", "f".repeat(64))],
  };
}

function change(decisionId: string): ApprovedChangePacketItem {
  return {
    subjectKey: `proposed-fact:${decisionId}`,
    summary: "CAT 336: trench",
    decisionId,
    decision: "ACCEPTED",
    reviewerId: "pm-1",
    approvedAt: "2026-10-01T12:00:00.000Z",
    reason: null,
    proposedFactId: "fact_1",
    changeType: null,
    document: { id: "doc_1", title: "Drainage Plan" },
    revisions: [{ id: "rev_1", label: "A", role: "extracted" }],
    evidence: [{
      documentPageId: "page_1",
      pageNumber: 1,
      excerpt: "trench",
      startOffset: 0,
      endOffset: 6,
      revisionId: "rev_1",
    }],
  };
}

function chapter(role: ExportPacketChapter["role"], sourceId: string, contentHash: string): ExportPacketChapter {
  return {
    role,
    title: role === "rfi" ? "RFI PDF" : "ACC export",
    sourceId,
    fetchedAt: "2026-10-01T16:00:00.000Z",
    contentHash,
    storageKey: `export-packets/project_1/chapters/${contentHash}.pdf`,
    filename: `${sourceId}.pdf`,
    byteSize: 12,
  };
}

function appendix(sourceId: string, contentHash: string): ExportPacketAppendix {
  return {
    role: "bluebeam-markup",
    title: "Markup Summary",
    sourceId,
    fetchedAt: "2026-10-01T17:00:00.000Z",
    contentHash,
    storageKey: `export-packets/project_1/appendices/${contentHash}.pdf`,
    filename: `${sourceId}.pdf`,
    byteSize: 20,
    pageCites: ["2"],
  };
}

function objectStore(): ObjectStore {
  const data = new Map<string, Buffer>();
  return {
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
    pages: [{ pageNumber: 1, text: [trench, pump].join("\n"), textSha256: "c".repeat(64) }],
  });
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId: revision.id,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  const storedRevision = await repository.getRevision("org_a", revision.id);
  await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued!.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
  });
  await repository.commitProposedFacts({
    organizationId: "org_a",
    extractionRunId: queued!.id,
    expectedStatus: "RUNNING",
    completedAt: new Date("2026-09-30T18:00:00.000Z"),
    facts: [equipmentFact(trench, "CAT 336"), equipmentFact(pump, "pump")].map((fact) => ({
      factType: fact.factType,
      payload: fact.payload,
      evidence: [{
        documentPageId: storedRevision!.pages[0]!.id,
        pageNumber: 1,
        excerpt: fact.excerpt,
        startOffset: 0,
        endOffset: fact.excerpt.length,
      }],
    })),
  });
  const stored = repository.proposedFacts.filter((fact) => fact.extractionRunId === queued!.id);
  return {
    repository,
    project: { id: project.id, documentId: document!.id, revisionId: revision.id },
    facts: { trench: stored[0]!, pump: stored[1]! },
  };
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
