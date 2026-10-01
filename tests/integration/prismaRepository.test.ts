import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createDocument, getDocument } from "@/lib/documents/service";
import { ingestRevision } from "@/lib/documents/ingestRevision";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { LocalDocumentStorage } from "@/lib/documents/storage";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { createProject, getProject } from "@/lib/projects/service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");

describe("Prisma PostgreSQL source repository", () => {
  const db = new PrismaClient();
  const repository = new PrismaConstructionRepository(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_org_a_${suffix}`;
  const orgB = `it_org_b_${suffix}`;
  let storageRoot = "";

  beforeAll(async () => {
    await db.organization.createMany({ data: [{ id: orgA, name: "Builder A" }, { id: orgB, name: "Builder B" }] });
    storageRoot = await mkdtemp(path.join(tmpdir(), "construction-prisma-it-"));
  });

  afterAll(async () => {
    const projects = await db.project.findMany({ where: { organizationId: { in: [orgA, orgB] } }, select: { id: true } });
    const projectIds = projects.map(({ id }) => id);
    const documents = await db.document.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const documentIds = documents.map(({ id }) => id);
    const revisions = await db.documentRevision.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
    const revisionIds = revisions.map(({ id }) => id);
    await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentPage.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentRevision.deleteMany({ where: { id: { in: revisionIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  it("persists the hierarchy and keeps same-title documents distinct", async () => {
    const project = await createProject(orgA, { name: "I-95 Bridge", projectNumber: "DOT-95" }, repository);
    const first = await createDocument(orgA, project.id, { title: "Drainage Plan" }, repository);
    const second = await createDocument(orgA, project.id, { title: "Drainage Plan" }, repository);
    expect(first.id).not.toBe(second.id);
    expect((await getProject(orgA, project.id, repository)).documents).toHaveLength(2);
    await expect(getProject(orgB, project.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDocument(orgB, first.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("persists hashes, stable page boundaries, deterministic order, and duplicate constraints", async () => {
    const project = (await repository.listProjects(orgA))[0]!;
    const document = (await repository.getProject(orgA, project.id))!.documents[0]!;
    const storage = new LocalDocumentStorage(storageRoot);
    const firstBytes = buildTextPdf(["Page one", "Page two only"]);
    const first = await ingestRevision(orgA, document.id, {
      revisionLabel: "Revision A", originalFilename: "drainage-a.pdf", mimeType: "application/pdf", bytes: firstBytes,
    }, { repository, storage });
    const second = await ingestRevision(orgA, document.id, {
      revisionLabel: "Revision B", originalFilename: "drainage-b.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Page one revised"]),
    }, { repository, storage });

    expect(first.revisionOrder).toBe(1);
    expect(second.revisionOrder).toBe(2);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.pages.map((page) => page.text)).toEqual(["Page one", "Page two only"]);
    expect((await repository.getRevision(orgA, first.id))?.pages.map((page) => page.text)).toEqual(["Page one", "Page two only"]);
    await expect(ingestRevision(orgA, document.id, {
      revisionLabel: "Revision C", originalFilename: "copy.pdf", mimeType: "application/pdf", bytes: firstBytes,
    }, { repository, storage })).rejects.toMatchObject({ code: "DUPLICATE_REVISION" });
  });
});
