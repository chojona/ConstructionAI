import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrismaClient } from "@/lib/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestRevision } from "@/lib/documents/ingestRevision";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { createDocument } from "@/lib/documents/service";
import { LocalDocumentStorage } from "@/lib/documents/storage";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { toProposedFactDto } from "@/lib/extractions/dto";
import { listProposedFacts, recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { createExtractionRun, advanceExtractionRun } from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");

const repeated = "Install pump 500 GPM.";
const provenance = {
  extractorName: "construction-facts",
  extractorVersion: "construction-facts-v1",
  provider: "openai",
  model: "gpt-4.1",
};

describe("Prisma proposed facts", () => {
  const db = createPrismaClient();
  const repository = new PrismaConstructionRepository(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_facts_a_${suffix}`;
  const orgB = `it_facts_b_${suffix}`;
  let storageRoot = "";

  beforeAll(async () => {
    await db.organization.createMany({ data: [{ id: orgA, name: "Builder A" }, { id: orgB, name: "Builder B" }] });
    storageRoot = await mkdtemp(path.join(tmpdir(), "construction-facts-it-"));
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

  it("stores exact repeated evidence without changing project truth or exposing storage paths", async () => {
    const project = await createProject(orgA, { name: "I-95 Bridge" }, repository);
    const document = await createDocument(orgA, project.id, { title: "Drainage Plan" }, repository);
    const storage = new LocalDocumentStorage(storageRoot);
    const revision = await ingestRevision(orgA, document.id, {
      revisionLabel: "Revision A",
      originalFilename: "drainage.pdf",
      mimeType: "application/pdf",
      bytes: buildTextPdf([`${repeated} Confirm access. ${repeated}`]),
    }, { repository, storage });
    const storedRevision = await repository.getRevision(orgA, revision.id);
    const pageText = storedRevision?.pages[0]?.text ?? "";
    const beforeProject = await repository.getProject(orgA, project.id);
    const beforeRevision = await repository.getRevision(orgA, revision.id);
    const firstStart = pageText.indexOf(repeated);
    const secondStart = pageText.indexOf(repeated, firstStart + 1);
    const run = await createExtractionRun(orgA, revision.id, provenance, repository);
    await advanceExtractionRun(orgA, run.id, { status: "RUNNING" }, repository);

    await recordProposedFacts(orgA, run.id, [{
      type: "equipment_requirement",
      equipment: "pump",
      statement: repeated,
      modality: "asserted",
      evidence: [
        { pageNumber: 1, excerpt: repeated, startOffset: firstStart, endOffset: firstStart + repeated.length },
        { pageNumber: 1, excerpt: repeated, startOffset: secondStart, endOffset: secondStart + repeated.length },
      ],
    }], repository);

    const facts = await listProposedFacts(orgA, run.id, repository);
    const pageId = storedRevision?.pages[0]?.id;
    expect(facts[0]?.evidence).toEqual([
      { documentPageId: pageId, pageNumber: 1, excerpt: repeated, startOffset: firstStart, endOffset: firstStart + repeated.length },
      { documentPageId: pageId, pageNumber: 1, excerpt: repeated, startOffset: secondStart, endOffset: secondStart + repeated.length },
    ]);
    expect(toProposedFactDto(facts[0]!)).not.toHaveProperty("storageKey");
    expect(JSON.stringify(toProposedFactDto(facts[0]!))).not.toContain(storedRevision?.storageKey);
    expect(await repository.getProject(orgA, project.id)).toEqual(beforeProject);
    expect(await repository.getRevision(orgA, revision.id)).toEqual(beforeRevision);

    const later = await createExtractionRun(orgA, revision.id, provenance, repository);
    await advanceExtractionRun(orgA, later.id, { status: "RUNNING" }, repository);
    const historical = await listProposedFacts(orgA, run.id, repository);
    await recordProposedFacts(orgA, later.id, [], repository);
    expect(await listProposedFacts(orgA, run.id, repository)).toEqual(historical);
    await expect(listProposedFacts(orgB, run.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.documentPage.delete({ where: { id: pageId } })).rejects.toThrow();
    await expect(db.extractionRun.delete({ where: { id: run.id } })).rejects.toThrow();
  });
});