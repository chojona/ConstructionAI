import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { getProjectReview, recordReviewDecision } from "./service";

const trench = "A CAT 336 excavator shall be used for the trench.";
const dozer = "A dozer shall be used.";

describe("recordReviewDecision", () => {
  it("accepts a proposed fact into effective state and keeps extraction history", async () => {
    const { repository, project } = await scaffold();
    const { facts, before } = await propose(repository, project.documentId, project.revisionId, [equipmentFact(trench, "CAT 336")]);
    const clock = sequencedClock();

    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, clock);

    const review = await getProjectReview("org_a", project.id, repository);
    expect(accepted.supersedesDecisionId).toBeNull();
    expect(review.state.facts).toEqual([
      expect.objectContaining({
        proposedFactId: facts[0]!.id,
        reviewerId: "pm-1",
        reason: "Confirmed on sheet C-101.",
        supersedesProposedFactId: null,
      }),
    ]);
    expect(review.findings[0]?.currentDecision?.id).toBe(accepted.id);
    expect(repository.proposedFacts.map(snapshotFact)).toEqual(before);
    await expect(recordReviewDecision("org_b", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, clock)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("supersedes a prior decision instead of rewriting it", async () => {
    const { repository, project } = await scaffold();
    const { facts } = await propose(repository, project.documentId, project.revisionId, [equipmentFact(trench, "CAT 336")]);
    const clock = sequencedClock();
    const flagged = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "FLAGGED",
      reason: "Ask the superintendent.",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, clock);
    const accepted = await recordReviewDecision("org_a", project.id, "pm-2", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, clock);

    expect(flagged.decision).toBe("FLAGGED");
    expect(accepted.supersedesDecisionId).toBe(flagged.id);
    const review = await getProjectReview("org_a", project.id, repository);
    expect(review.decisions.map((item) => item.decision)).toEqual(["FLAGGED", "ACCEPTED"]);
    expect(review.state.facts.map((fact) => fact.decisionId)).toEqual([accepted.id]);
    expect(review.state.facts[0]?.reviewerId).toBe("pm-2");
  });

  it("accepts a material change and an explicit removal", async () => {
    const { repository, project } = await scaffold();
    const base = await propose(repository, project.documentId, project.revisionId, [equipmentFact(trench, "CAT 336")]);
    const revised = await repository.createRevision({
      documentId: project.documentId,
      revisionLabel: "B",
      originalFilename: "b.pdf",
      mimeType: "application/pdf",
      byteSize: 11,
      sha256: "b".repeat(64),
      storageKey: "revisions/b.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: dozer, textSha256: "d".repeat(64) }],
    });
    const next = await propose(repository, project.documentId, revised.id, [equipmentFact(dozer, "dozer")]);
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: base.facts[0]!.id },
    }, repository, clock);

    const review = await getProjectReview("org_a", project.id, repository);
    const removed = review.findings.find((finding) => finding.subject.type === "revision_change" && finding.subject.changeType === "REMOVED");
    const added = review.findings.find((finding) => finding.subject.type === "revision_change" && finding.subject.changeType === "ADDED");
    expect(removed?.subject).toMatchObject({ beforeProposedFactId: base.facts[0]!.id, afterProposedFactId: null });
    expect(added?.subject).toMatchObject({ afterProposedFactId: next.facts[0]!.id });

    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: added!.subject,
    }, repository, clock);
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "The excavator note was deleted.",
      subject: removed!.subject,
    }, repository, clock);

    const after = await getProjectReview("org_a", project.id, repository);
    expect(after.state.facts.map((fact) => fact.proposedFactId)).toEqual([next.facts[0]!.id]);
    expect(after.state.facts[0]).toMatchObject({ supersedesProposedFactId: null });
    expect(after.state.retirements).toEqual([
      expect.objectContaining({ proposedFactId: base.facts[0]!.id, supersededByProposedFactId: null }),
    ]);
    expect(repository.extractionRuns.map((run) => run.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
  });

  it("requires a reason to dismiss or flag and a reviewer id to record anything", async () => {
    const { repository, project } = await scaffold();
    const { facts } = await propose(repository, project.documentId, project.revisionId, [equipmentFact(trench, "CAT 336")]);
    const subject = { type: "proposed_fact" as const, proposedFactId: facts[0]!.id };
    await expect(recordReviewDecision("org_a", project.id, " ", {
      decision: "ACCEPTED",
      subject,
    }, repository)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "DISMISSED",
      subject,
    }, repository)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "FLAGGED",
      reason: "   ",
      subject,
    }, repository)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
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
    pages: [{ pageNumber: 1, text: trench, textSha256: "c".repeat(64) }],
  });
  return { repository, project: { id: project.id, documentId: document!.id, revisionId: revision.id } };
}

async function propose(
  repository: MemoryRepository,
  documentId: string,
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
  const stored = repository.proposedFacts.filter((fact) => fact.extractionRunId === queued.id);
  return { facts: stored.map(snapshotFact), before: repository.proposedFacts.map(snapshotFact), documentId };
}

function equipmentFact(excerpt: string, equipment: string) {
  return {
    factType: "equipment_requirement" as const,
    excerpt,
    payload: { equipment, statement: excerpt, modality: "asserted" },
  };
}

function snapshotFact(fact: { id: string; payload: Record<string, string | null>; evidence: unknown; extractionRunId: string }) {
  return { id: fact.id, extractionRunId: fact.extractionRunId, payload: { ...fact.payload }, evidence: fact.evidence };
}

function sequencedClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 30, 12, tick++));
}
