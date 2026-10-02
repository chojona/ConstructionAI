import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { createHash } from "node:crypto";
import {
  APPROVED_CHANGE_PACKET_NOTE,
  EXPORT_BLOCKED_MESSAGE,
  approvedChangePreview,
  canonicalPacketBytes,
  exportPacketAction,
  exportPacketStorageKey,
  packetContentHash,
  subjectExportVisible,
  visiblePacketChanges,
} from "./exportPacket";
import { EXPORT_OPEN_MESSAGE } from "./exportPacketView";
import { exportApprovedChangePacket, getProjectReview, recordReviewDecision } from "./service";

const trench = "A CAT 336 excavator shall be used for the trench.";
const dozer = "A dozer shall be used.";
const pump = "A pump shall dewater the excavation.";
const loader = "A loader shall stockpile the spoil.";

describe("export packet gate", () => {
  it("stays off until a change is approved", () => {
    expect(EXPORT_BLOCKED_MESSAGE).toBe("Approve at least one change to export.");
    expect(subjectExportVisible(null)).toBe(false);
    expect(subjectExportVisible("DISMISSED")).toBe(false);
    expect(subjectExportVisible("FLAGGED")).toBe(false);
    expect(subjectExportVisible("ACCEPTED")).toBe(true);
    expect(exportPacketAction(0, "project_1")).toEqual({
      enabled: false,
      href: null,
      message: EXPORT_BLOCKED_MESSAGE,
    });
    expect(exportPacketAction(1, "project_1")).toEqual({
      enabled: true,
      href: "/api/projects/project_1/export",
      message: null,
    });
  });

  it("stays off while any change is still open, even when an accepted fact is eligible", () => {
    expect(exportPacketAction(3, "project_demo_review", 4)).toEqual({
      enabled: false,
      href: null,
      message: EXPORT_OPEN_MESSAGE,
    });
    expect(exportPacketAction(0, "project_demo_review", 0).enabled).toBe(false);
    expect(exportPacketAction(1, "project_demo_review", 0)).toEqual({
      enabled: true,
      href: "/api/projects/project_demo_review/export",
      message: null,
    });
  });

  it("drops pending and rejected changes from the packet preview", () => {
    const visible = visiblePacketChanges([
      { decision: "ACCEPTED", summary: "approved" },
      { decision: "DISMISSED", summary: "rejected" },
      { decision: "FLAGGED", summary: "pending flag" },
      { decision: "", summary: "open" },
    ]);
    expect(visible.map((item) => item.summary)).toEqual(["approved"]);
  });

  it("exports only the approved change, with cited evidence and revision ids", async () => {
    const { repository, project, facts } = await scaffold();
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
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "FLAGGED",
      reason: "Ask the superintendent.",
      subject: { type: "proposed_fact", proposedFactId: facts.pump.id },
    }, repository, clock);
    const decisionsBefore = repository.reviewDecisions.length;

    const review = await getProjectReview("org_a", project.id, repository);
    const preview = approvedChangePreview(review.findings);
    expect(preview).toEqual([
      expect.objectContaining({
        decision: "ACCEPTED",
        summary: expect.stringContaining("CAT 336"),
        evidence: [expect.objectContaining({ pageNumber: 1, excerpt: trench, revisionId: project.revisionId })],
      }),
    ]);
    expect(preview.some((item) => /dozer|pump|loader/i.test(item.summary))).toBe(false);

    const exportedAt = new Date("2026-10-01T20:00:00.000Z");
    const packet = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => exportedAt);
    expect(packet.changes).toHaveLength(1);
    expect(packet.changes[0]).toMatchObject({
      decision: "ACCEPTED",
      decisionId: accepted.id,
      reviewerId: "pm-1",
      reason: "Confirmed on sheet C-101.",
      proposedFactId: facts.trench.id,
      summary: expect.stringContaining("CAT 336"),
      document: { id: project.documentId, title: "Drainage Plan" },
      revisions: [expect.objectContaining({ id: project.revisionId, label: "A" })],
      evidence: [expect.objectContaining({
        pageNumber: 1,
        excerpt: trench,
        revisionId: project.revisionId,
      })],
    });
    expect(packet.note).toBe(APPROVED_CHANGE_PACKET_NOTE);
    expect(packet.decisionIds).toEqual([accepted.id]);
    expect(packet.generatedAt).toBe(exportedAt.toISOString());
    expect(packet.contentHash).toBe(packetContentHash(packet));
    expect(packet.contentHash).toHaveLength(64);
    expect(JSON.stringify(packet).toLowerCase()).not.toMatch(/entitlement|force account|force-account|\bdsc\b|\bpco\b|change order/);
    expect(repository.reviewDecisions).toHaveLength(decisionsBefore);
    expect(repository.reviewDecisions.map((decision) => decision.decision)).toEqual(["ACCEPTED", "DISMISSED", "FLAGGED"]);
    expect(repository.exportPackets).toHaveLength(1);
    expect(repository.emailSends).toHaveLength(0);
    expect(repository.exportPackets[0]).toMatchObject({
      contentHash: packet.contentHash,
      storageKey: exportPacketStorageKey(project.id, packet.contentHash),
      reviewDecisionIds: [accepted.id],
      byteSize: repository.exportPackets[0]!.payload.byteLength,
    });
    const stored = JSON.parse(repository.exportPackets[0]!.payload.toString("utf8")) as { changes: Array<{ evidence: Array<Record<string, unknown>> }> };
    expect(createHash("sha256").update(repository.exportPackets[0]!.payload).digest("hex")).toBe(packet.contentHash);
    expect(stored.changes[0]?.evidence).toEqual([expect.objectContaining({ pageNumber: 1, excerpt: trench, revisionId: project.revisionId })]);
    expect(Object.keys(stored.changes[0]!.evidence[0]!).slice(0, 4)).toEqual(["revisionId", "revisionLabel", "contentHash", "documentPageId"]);
    expect(stored.changes[0]?.evidence[0]).toMatchObject({
      revisionId: project.revisionId,
      revisionLabel: "A",
      contentHash: "a".repeat(64),
    });
    expect(stored.changes[0]?.evidence[0]?.revisionId).not.toMatch(/^(current|latest)$/);
    expect(canonicalPacketBytes(packet).equals(repository.exportPackets[0]!.payload)).toBe(true);

    const again = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => new Date("2026-10-02T00:00:00.000Z"));
    expect(again.contentHash).toBe(packet.contentHash);
    expect(again.generatedAt).toBe(packet.generatedAt);
    expect(repository.exportPackets).toHaveLength(1);

    const one = await exportApprovedChangePacket("org_a", project.id, { subjectKey: accepted.subjectKey }, repository, () => exportedAt);
    expect(one.changes.map((change) => change.proposedFactId)).toEqual([facts.trench.id]);
    expect(repository.exportPackets).toHaveLength(1);

    await expect(repository.saveExportPacket({
      organizationId: "org_a",
      projectId: project.id,
      contentHash: "b".repeat(64),
      storageKey: "export-packets/rejected.json",
      payload: Buffer.from("{}"),
      reviewDecisionIds: [repository.reviewDecisions[1]!.id],
      createdAt: exportedAt,
    })).rejects.toMatchObject({ message: "Only an approved change can be exported." });
    expect(repository.exportPackets).toHaveLength(1);
  });

  it("refuses to export a rejected, flagged, or open change", async () => {
    const { repository, project, facts } = await scaffold();
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
    const review = await getProjectReview("org_a", project.id, repository);
    const open = review.findings.find((finding) => finding.subject.type === "proposed_fact" && finding.subject.proposedFactId === facts.loader.id);
    expect(open?.currentDecision).toBeNull();

    await expect(exportApprovedChangePacket("org_a", project.id, {}, repository, clock)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: EXPORT_BLOCKED_MESSAGE,
    });
    await expect(exportApprovedChangePacket("org_a", project.id, { subjectKey: rejected.subjectKey }, repository, clock)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Only an approved change can be exported.",
    });
    await expect(exportApprovedChangePacket("org_a", project.id, { subjectKey: flagged.subjectKey }, repository, clock)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(exportApprovedChangePacket("org_a", project.id, { subjectKey: open?.subjectKey }, repository, clock)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(exportApprovedChangePacket("org_a", project.id, { subjectKey: "proposed-fact:missing" }, repository, clock)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(approvedChangePreview(review.findings)).toEqual([]);
    expect(repository.exportPackets).toHaveLength(0);
  });

  it("stops exporting a change after a later rejection supersedes approval", async () => {
    const { repository, project, facts } = await scaffold();
    const clock = sequencedClock();
    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await recordReviewDecision("org_a", project.id, "pm-2", {
      decision: "DISMISSED",
      reason: "Superseded on site.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);

    await expect(exportApprovedChangePacket("org_a", project.id, { subjectKey: accepted.subjectKey }, repository, clock)).rejects.toMatchObject({
      message: "Only an approved change can be exported.",
    });
    await expect(exportApprovedChangePacket("org_a", project.id, {}, repository, clock)).rejects.toMatchObject({
      message: EXPORT_BLOCKED_MESSAGE,
    });
    const review = await getProjectReview("org_a", project.id, repository);
    expect(review.decisions.map((decision) => decision.decision)).toEqual(["ACCEPTED", "DISMISSED"]);
    expect(review.findings.find((finding) => finding.subjectKey === accepted.subjectKey)?.currentDecision?.decision).toBe("DISMISSED");
    expect(repository.exportPackets).toHaveLength(0);
  });

  it("keeps the approved cite on the original revision after a newer revision is stored", async () => {
    const { repository, project, facts } = await scaffold();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const newer = await repository.createRevision({
      documentId: project.documentId,
      revisionLabel: "B",
      originalFilename: "b.pdf",
      mimeType: "application/pdf",
      byteSize: 12,
      sha256: "b".repeat(64),
      storageKey: "revisions/b.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: "A loader shall stockpile the spoil.", textSha256: "d".repeat(64) }],
    });
    await propose(repository, newer.id, [equipmentFact("A loader shall stockpile the spoil.", "loader")]);

    const packet = await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    expect(packet.changes[0]?.evidence).toEqual([expect.objectContaining({
      revisionId: project.revisionId,
      revisionLabel: "A",
      contentHash: "a".repeat(64),
      pageNumber: 1,
    })]);
    expect(packet.changes[0]?.evidence.some((item) => item.revisionId === newer.id || item.contentHash === "b".repeat(64))).toBe(false);
  });
});

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
