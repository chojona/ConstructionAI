import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import {
  advanceExtractionRun,
  createExtractionRun,
  getExtractionRun,
  listExtractionRuns,
} from "./service";

const provenance = {
  extractorName: "construction-facts",
  extractorVersion: "construction-facts-v1",
  provider: "openai",
  model: "gpt-4.1",
};

const clock = () => new Date("2026-09-30T18:00:00.000Z");

async function processedRevision(repository: MemoryRepository, organizationId = "org_a") {
  const project = await repository.createProject({ organizationId, name: "I-95 Bridge" });
  const document = await repository.createDocument({
    organizationId,
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
    storageKey: "revisions/drainage.pdf",
    status: "PROCESSED",
    pages: [{ pageNumber: 1, text: "Provide pump 500 GPM.", textSha256: "b".repeat(64) }],
  });
}

describe("extraction run service", () => {
  it("creates and reads a queued run for a processed revision", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const created = await createExtractionRun("org_a", revision.id, provenance, repository);
    const listed = await listExtractionRuns("org_a", revision.id, repository);
    const loaded = await getExtractionRun("org_a", created.id, repository);

    expect(created).toMatchObject({
      documentRevisionId: revision.id,
      attemptNumber: 1,
      ...provenance,
      status: "QUEUED",
      failureCode: null,
      failureMessage: null,
      startedAt: null,
      completedAt: null,
    });
    expect(listed).toEqual([created]);
    expect(loaded).toEqual(created);
  });

  it("preserves failed and superseded attempts independently", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const first = await createExtractionRun("org_a", revision.id, provenance, repository);
    await advanceExtractionRun("org_a", first.id, { status: "RUNNING" }, repository, clock);
    const failed = await advanceExtractionRun("org_a", first.id, {
      status: "FAILED",
      failureCode: "MALFORMED_OUTPUT",
      failureMessage: "Model output failed schema validation.",
    }, repository, clock);

    const second = await createExtractionRun("org_a", revision.id, {
      ...provenance,
      model: "gpt-4.1-mini",
    }, repository);
    await advanceExtractionRun("org_a", second.id, { status: "RUNNING" }, repository, clock);
    const succeeded = await advanceExtractionRun("org_a", second.id, { status: "SUCCEEDED" }, repository, clock);
    const superseded = await advanceExtractionRun("org_a", succeeded.id, { status: "SUPERSEDED" }, repository, clock);

    const runs = await listExtractionRuns("org_a", revision.id, repository);
    expect(runs.map((run) => run.attemptNumber)).toEqual([1, 2]);
    expect(runs[0]).toMatchObject({
      id: failed.id,
      status: "FAILED",
      failureCode: "MALFORMED_OUTPUT",
      failureMessage: "Model output failed schema validation.",
      extractorVersion: "construction-facts-v1",
      model: "gpt-4.1",
      startedAt: clock(),
      completedAt: clock(),
    });
    expect(runs[1]).toMatchObject({
      id: superseded.id,
      status: "SUPERSEDED",
      failureCode: null,
      model: "gpt-4.1-mini",
      completedAt: clock(),
    });
    expect(runs[0]!.id).not.toBe(runs[1]!.id);
  });

  it("rejects illegal lifecycle moves without rewriting a finished attempt", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const run = await createExtractionRun("org_a", revision.id, provenance, repository);

    await expect(advanceExtractionRun("org_a", run.id, { status: "SUCCEEDED" }, repository, clock))
      .rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await advanceExtractionRun("org_a", run.id, { status: "FAILED", failureCode: "PROVIDER_TIMEOUT" }, repository, clock);
    await expect(advanceExtractionRun("org_a", run.id, { status: "SUCCEEDED" }, repository, clock))
      .rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(advanceExtractionRun("org_a", run.id, { status: "SUPERSEDED" }, repository, clock))
      .rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    expect(await getExtractionRun("org_a", run.id, repository)).toMatchObject({
      status: "FAILED",
      failureCode: "PROVIDER_TIMEOUT",
      extractorName: "construction-facts",
      extractorVersion: "construction-facts-v1",
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  it("requires failure metadata only when an attempt fails", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const run = await createExtractionRun("org_a", revision.id, provenance, repository);
    await expect(advanceExtractionRun("org_a", run.id, { status: "FAILED" }, repository, clock))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await advanceExtractionRun("org_a", run.id, { status: "RUNNING" }, repository, clock);
    await expect(advanceExtractionRun("org_a", run.id, {
      status: "SUCCEEDED",
      failureCode: "SHOULD_NOT_STICK",
    }, repository, clock)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect((await getExtractionRun("org_a", run.id, repository))?.status).toBe("RUNNING");
  });

  it("keeps analysis inside the organization that owns the revision", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    repository.addOrganization("org_b");
    const revision = await processedRevision(repository);
    const run = await createExtractionRun("org_a", revision.id, provenance, repository);

    await expect(createExtractionRun("org_b", revision.id, provenance, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listExtractionRuns("org_b", revision.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getExtractionRun("org_b", run.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(advanceExtractionRun("org_b", run.id, { status: "RUNNING" }, repository, clock))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getExtractionRun("org_a", run.id, repository))?.status).toBe("QUEUED");
  });

  it("does not mutate canonical revision truth", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const before = await repository.getRevision("org_a", revision.id);
    const projectBefore = await repository.getProject("org_a", revision.document.project.id);

    const run = await createExtractionRun("org_a", revision.id, provenance, repository);
    await advanceExtractionRun("org_a", run.id, { status: "RUNNING" }, repository, clock);
    await advanceExtractionRun("org_a", run.id, {
      status: "FAILED",
      failureCode: "EMPTY_FACTS",
      failureMessage: "No facts were proposed.",
    }, repository, clock);

    expect(await repository.getRevision("org_a", revision.id)).toEqual(before);
    expect(await repository.getProject("org_a", revision.document.project.id)).toEqual(projectBefore);
    expect(repository.extractionRuns).toHaveLength(1);
  });

  it("refuses analysis until the revision is processed", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const project = await repository.createProject({ organizationId: "org_a", name: "Bridge" });
    const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Scan" });
    const revision = await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "Scan A",
      originalFilename: "scan.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      sha256: "c".repeat(64),
      storageKey: "revisions/scan.pdf",
      status: "FAILED",
      failureCode: "SCANNED_OR_EMPTY",
      pages: [],
    });

    await expect(createExtractionRun("org_a", revision.id, provenance, repository))
      .rejects.toMatchObject({ code: "REVISION_NOT_READY" });
    expect(repository.extractionRuns).toHaveLength(0);
  });

  it("numbers attempts independently for each revision", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const first = await processedRevision(repository);
    const project = (await repository.listProjects("org_a"))[0]!;
    const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Second spec" });
    const second = await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "Revision A",
      originalFilename: "second.pdf",
      mimeType: "application/pdf",
      byteSize: 20,
      sha256: "d".repeat(64),
      storageKey: "revisions/second.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: "Install 12 doors.", textSha256: "e".repeat(64) }],
    });

    await createExtractionRun("org_a", first.id, provenance, repository);
    await createExtractionRun("org_a", first.id, provenance, repository);
    const other = await createExtractionRun("org_a", second.id, provenance, repository);
    expect(other.attemptNumber).toBe(1);
    expect((await listExtractionRuns("org_a", first.id, repository)).map((run) => run.attemptNumber)).toEqual([1, 2]);
  });
});
