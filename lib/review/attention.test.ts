import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { listAttention, listSettled } from "./attention";
import { getProjectReview, recordReviewDecision } from "./service";

const october = "Notice to proceed is mid October.";
const november = "Notice to proceed is mid November.";
const crane = "A tower crane shall be used.";
const craneWording = "A tower crane is required.";

describe("listAttention", () => {
  it("ranks open material changes and unreviewed facts ahead of settled or wording-only records", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
    const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Drainage Plan" });
    const base = await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      sha256: "a".repeat(64),
      storageKey: "revisions/a.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: `${october}\n${crane}`, textSha256: "c".repeat(64) }],
    });
    const revised = await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "B",
      originalFilename: "b.pdf",
      mimeType: "application/pdf",
      byteSize: 11,
      sha256: "b".repeat(64),
      storageKey: "revisions/b.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 2, text: `${november}\n${craneWording}`, textSha256: "d".repeat(64) }],
    });
    const baseFacts = await propose(repository, base.id, [
      {
        factType: "schedule_date",
        excerpt: october,
        payload: { event: "notice to proceed", date: null, dateText: "mid October", modality: "asserted" },
      },
      {
        factType: "equipment_requirement",
        excerpt: crane,
        payload: { equipment: "tower crane", statement: crane, modality: "asserted" },
      },
    ]);
    const schedule = baseFacts.filter((fact) => fact.factType === "schedule_date");
    await propose(repository, revised.id, [
      {
        factType: "schedule_date",
        excerpt: november,
        payload: { event: "notice to proceed", date: null, dateText: "mid November", modality: "asserted" },
      },
      {
        factType: "equipment_requirement",
        excerpt: craneWording,
        payload: { equipment: "tower crane", statement: craneWording, modality: "asserted" },
      },
    ]);

    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: schedule[0]!.id },
    }, repository);
    const open = await getProjectReview("org_a", project.id, repository);
    const equipment = open.findings.find((finding) => finding.label.startsWith("tower crane") && finding.subject.type === "proposed_fact");
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "FLAGGED",
      reason: "Confirm the crane is still on the job.",
      subject: equipment!.subject,
    }, repository);

    const review = await getProjectReview("org_a", project.id, repository);
    const attention = listAttention(review.findings);
    expect(attention.map((item) => [item.severity, item.finding.label, item.reason])).toEqual([
      ["high", "tower crane: A tower crane shall be used.", "Confirm the crane is still on the job."],
      ["high", "notice to proceed: mid November", "Material change between revisions. The date changed."],
    ]);
    const dateChange = attention[1]!.finding;
    expect(dateChange.before).toMatchObject({
      summary: "notice to proceed: mid October",
      evidence: [{ pageNumber: 1, excerpt: october }],
    });
    expect(dateChange.after).toMatchObject({
      summary: "notice to proceed: mid November",
      evidence: [{ pageNumber: 2, excerpt: november }],
    });
    expect(dateChange.sources.map((source) => source.revisionLabel)).toEqual(["A", "B"]);
    expect(listSettled(review.findings).map((finding) => finding.detail)).toEqual(expect.arrayContaining([
      expect.stringContaining("wording only"),
      "Proposed by extraction",
    ]));
    expect(listSettled(review.findings).some((finding) => finding.currentDecision?.decision === "ACCEPTED")).toBe(true);
  });
});

async function propose(
  repository: MemoryRepository,
  documentRevisionId: string,
  facts: Array<{ factType: "equipment_requirement" | "schedule_date"; payload: Record<string, string | null>; excerpt: string }>,
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
        pageNumber: revision.pages[0]!.pageNumber,
        excerpt: fact.excerpt,
        startOffset: revision.pages[0]!.text.indexOf(fact.excerpt),
        endOffset: revision.pages[0]!.text.indexOf(fact.excerpt) + fact.excerpt.length,
      }],
    })),
  });
  return repository.proposedFacts.filter((fact) => fact.extractionRunId === queued.id);
}
