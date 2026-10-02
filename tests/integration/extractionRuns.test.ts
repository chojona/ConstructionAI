import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestRevision } from "@/lib/documents/ingestRevision";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { createDocument } from "@/lib/documents/service";
import { LocalDocumentStorage } from "@/lib/documents/storage";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import {
  advanceExtractionRun,
  createExtractionRun,
  listExtractionRuns,
} from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

const provenance = {
  extractorName: "construction-facts",
  extractorVersion: "construction-facts-v1",
  provider: "openai",
  model: "gpt-4.1",
};

describe.skipIf(!hasIntegrationDatabase)("Prisma extraction runs", () => {
  const db = integrationDb();
  const repository = new PrismaConstructionRepository(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_extract_a_${suffix}`;
  const orgB = `it_extract_b_${suffix}`;
  let storageRoot = "";

  beforeAll(async () => {
    await db.organization.createMany({ data: [{ id: orgA, name: "Builder A" }, { id: orgB, name: "Builder B" }] });
    storageRoot = await mkdtemp(path.join(tmpdir(), "construction-extraction-it-"));
  });

  afterAll(async () => {
    const projects = await db.project.findMany({ where: { organizationId: { in: [orgA, orgB] } }, select: { id: true } });
    const projectIds = projects.map(({ id }) => id);
    const documents = await db.document.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const documentIds = documents.map(({ id }) => id);
    const revisions = await db.documentRevision.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
    const revisionIds = revisions.map(({ id }) => id);
    const runs = await db.extractionRun.findMany({ where: { documentRevisionId: { in: revisionIds } }, select: { id: true } });
    const runIds = runs.map(({ id }) => id);
    await db.proposedFactEvidence.deleteMany({ where: { proposedFact: { extractionRunId: { in: runIds } } } });
    await db.proposedFact.deleteMany({ where: { extractionRunId: { in: runIds } } });
    await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentPage.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentRevision.deleteMany({ where: { id: { in: revisionIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  it("persists independent attempts without changing the source revision", async () => {
    const project = await createProject(orgA, { name: "I-95 Bridge" }, repository);
    const document = await createDocument(orgA, project.id, { title: "Drainage Plan" }, repository);
    const storage = new LocalDocumentStorage(storageRoot);
    const revision = await ingestRevision(orgA, document.id, {
      revisionLabel: "Revision A",
      originalFilename: "drainage.pdf",
      mimeType: "application/pdf",
      bytes: buildTextPdf(["Provide pump 500 GPM."]),
    }, { repository, storage });
    const before = await repository.getRevision(orgA, revision.id);

    const failed = await createExtractionRun(orgA, revision.id, provenance, repository);
    await advanceExtractionRun(orgA, failed.id, { status: "RUNNING" }, repository);
    await advanceExtractionRun(orgA, failed.id, {
      status: "FAILED",
      failureCode: "MALFORMED_OUTPUT",
      failureMessage: "Model output failed schema validation.",
    }, repository);
    const succeeded = await createExtractionRun(orgA, revision.id, provenance, repository);
    await advanceExtractionRun(orgA, succeeded.id, { status: "RUNNING" }, repository);
    await advanceExtractionRun(orgA, succeeded.id, { status: "SUCCEEDED" }, repository);

    const runs = await listExtractionRuns(orgA, revision.id, repository);
    expect(runs.map((run) => [run.attemptNumber, run.status, run.failureCode])).toEqual([
      [1, "FAILED", "MALFORMED_OUTPUT"],
      [2, "SUCCEEDED", null],
    ]);
    expect(await repository.getRevision(orgA, revision.id)).toEqual(before);
    await expect(listExtractionRuns(orgB, revision.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.documentRevision.delete({ where: { id: revision.id } })).rejects.toThrow();
  });
});