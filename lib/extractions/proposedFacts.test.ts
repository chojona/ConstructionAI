import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { toProposedFactDto } from "./dto";
import { listProposedFacts, recordProposedFacts } from "./proposedFacts";

const repeated = "Install pump 500 GPM.";
const pageText = `${repeated} Confirm access. ${repeated}`;

describe("proposed facts", () => {
  it("keeps repeated excerpts on the same page distinct by offset and page id", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository, pageText);
    const run = await runningRun(repository, revision.id);
    const page = revision.pages[0]!;
    const first = pageText.indexOf(repeated);
    const second = pageText.indexOf(repeated, first + 1);

    await recordProposedFacts("org_a", run.id, [{
      type: "equipment_requirement",
      equipment: "pump",
      statement: repeated,
      modality: "asserted",
      evidence: [
        { pageNumber: 1, excerpt: repeated, startOffset: first, endOffset: first + repeated.length },
        { pageNumber: 1, excerpt: repeated, startOffset: second, endOffset: second + repeated.length },
      ],
    }], repository);

    const facts = await listProposedFacts("org_a", run.id, repository);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.extractionRunId).toBe(run.id);
    expect(facts[0]?.evidence).toEqual([
      { documentPageId: page.id, pageNumber: 1, excerpt: repeated, startOffset: first, endOffset: first + repeated.length },
      { documentPageId: page.id, pageNumber: 1, excerpt: repeated, startOffset: second, endOffset: second + repeated.length },
    ]);
    expect(toProposedFactDto(facts[0]!)).not.toHaveProperty("storageKey");
    expect(JSON.stringify(toProposedFactDto(facts[0]!))).not.toContain(revision.storageKey);
    expect(await repository.getProject("org_a", revision.document.project.id)).toMatchObject({
      name: "I-95 Bridge",
    });
    expect(await repository.getRevision("org_a", revision.id)).toMatchObject({
      status: "PROCESSED",
      storageKey: revision.storageKey,
    });
  });

  it("rejects evidence that does not cite a page on the run's revision", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository, pageText);
    const run = await runningRun(repository, revision.id);

    await expect(recordProposedFacts("org_a", run.id, [{
      type: "quantity",
      subject: "pump",
      amount: "500",
      unit: "GPM",
      originalText: "500 GPM",
      modality: "asserted",
      evidence: [{ pageNumber: 2, excerpt: repeated, startOffset: 0, endOffset: repeated.length }],
    }], repository)).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expect(listProposedFacts("org_a", run.id, repository)).resolves.toEqual([]);
    expect(repository.extractionRuns[0]?.status).toBe("RUNNING");
  });

  it("rejects an excerpt whose offsets point at different text on the same page", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository, pageText);
    const run = await runningRun(repository, revision.id);
    const startOffset = pageText.lastIndexOf(repeated);

    await expect(recordProposedFacts("org_a", run.id, [{
      type: "equipment_requirement",
      equipment: "pump",
      statement: repeated,
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: repeated, startOffset: startOffset - 1, endOffset: startOffset - 1 + repeated.length }],
    }], repository)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(listProposedFacts("org_a", run.id, repository)).resolves.toEqual([]);
  });

  it("hides proposed facts from another organization", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    repository.addOrganization("org_b");
    const revision = await processedRevision(repository, pageText);
    const run = await runningRun(repository, revision.id);
    const startOffset = pageText.indexOf(repeated);
    await recordProposedFacts("org_a", run.id, [{
      type: "equipment_requirement",
      equipment: "pump",
      statement: repeated,
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: repeated, startOffset, endOffset: startOffset + repeated.length }],
    }], repository);

    await expect(listProposedFacts("org_b", run.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(recordProposedFacts("org_b", run.id, [], repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("leaves an earlier run's facts unchanged after a later extraction", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository, pageText);
    const beforeProject = structuredClone(await repository.getProject("org_a", revision.document.project.id));
    const beforeRevision = structuredClone(await repository.getRevision("org_a", revision.id));
    const first = await runningRun(repository, revision.id);
    const startOffset = pageText.indexOf(repeated);
    await recordProposedFacts("org_a", first!.id, [{
      type: "equipment_requirement",
      equipment: "pump",
      statement: repeated,
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: repeated, startOffset, endOffset: startOffset + repeated.length }],
    }], repository);
    const historical = structuredClone(await listProposedFacts("org_a", first!.id, repository));

    const second = await runningRun(repository, revision.id);
    const laterExcerpt = "Confirm access.";
    const laterStart = pageText.indexOf(laterExcerpt);
    await recordProposedFacts("org_a", second!.id, [{
      type: "equipment_requirement",
      equipment: "access",
      statement: laterExcerpt,
      modality: "tentative",
      evidence: [{ pageNumber: 1, excerpt: laterExcerpt, startOffset: laterStart, endOffset: laterStart + laterExcerpt.length }],
    }], repository);

    expect(await listProposedFacts("org_a", first!.id, repository)).toEqual(historical);
    await expect(recordProposedFacts("org_a", first!.id, [], repository)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await listProposedFacts("org_a", first!.id, repository)).toEqual(historical);
    expect(await repository.getProject("org_a", revision.document.project.id)).toEqual(beforeProject);
    expect(await repository.getRevision("org_a", revision.id)).toEqual(beforeRevision);
  });
});

async function processedRevision(repository: MemoryRepository, text: string) {
  const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
  const document = await repository.createDocument({
    organizationId: "org_a",
    projectId: project.id,
    title: "Drainage Plan",
  });
  return repository.createRevision({
    documentId: document!.id,
    revisionLabel: "Revision A",
    originalFilename: "drainage.pdf",
    mimeType: "application/pdf",
    byteSize: 1200,
    sha256: "a".repeat(64),
    storageKey: "revisions/private/drainage.pdf",
    status: "PROCESSED",
    pages: [{ pageNumber: 1, text, textSha256: "b".repeat(64) }],
  });
}

async function runningRun(repository: MemoryRepository, documentRevisionId: string) {
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId,
    extractorName: "construction-facts",
    extractorVersion: "construction-facts-v1",
    provider: "openai",
    model: "gpt-4.1",
  });
  if (!queued) throw new Error("Missing extraction run");
  const running = await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
    startedAt: new Date("2026-09-30T18:00:00.000Z"),
  });
  if (!running) throw new Error("Extraction run did not start");
  return running;
}
