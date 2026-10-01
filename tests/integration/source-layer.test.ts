import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createDocument, getDocument, getRevision } from "@/lib/documents/service";
import { ingestRevision } from "@/lib/documents/ingestRevision";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { LocalDocumentStorage } from "@/lib/documents/storage";
import { createProject, getProject } from "@/lib/projects/service";
import { MemoryRepository } from "@/tests/support/memoryRepository";

describe("source layer workflow", () => {
  const repository = new MemoryRepository();
  const roots: string[] = [];
  repository.addOrganization("builder_one"); repository.addOrganization("builder_two");
  afterAll(async () => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

  it("creates project → document → immutable revision → page records", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "construction-integration-")); roots.push(root);
    const project = await createProject("builder_one", { name: "I-95 Bridge", projectNumber: "P-100" }, repository);
    const document = await createDocument("builder_one", project.id, { title: "Drainage Plan" }, repository);
    const revision = await ingestRevision("builder_one", document.id, {
      revisionLabel: "Revision A", originalFilename: "drainage.pdf", mimeType: "application/pdf",
      bytes: buildTextPdf(["GENERAL NOTES", "PIPE SCHEDULE\n24 IN RCP"]),
    }, { repository, storage: new LocalDocumentStorage(root) });

    expect((await getProject("builder_one", project.id, repository)).documents[0]).toMatchObject({ id: document.id, revisionCount: 1 });
    expect((await getDocument("builder_one", document.id, repository)).revisions[0]?.id).toBe(revision.id);
    expect((await getRevision("builder_one", revision.id, repository)).pages.map((page) => page.text)).toEqual(["GENERAL NOTES", "PIPE SCHEDULE\n24 IN RCP"]);
  });

  it("makes every hierarchy lookup tenant-scoped", async () => {
    const project = repository.projects.find((item) => item.organizationId === "builder_one")!;
    const document = repository.documents.find((item) => item.projectId === project.id)!;
    const revision = repository.revisions.find((item) => item.documentId === document.id)!;
    await expect(getProject("builder_two", project.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDocument("builder_two", document.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getRevision("builder_two", revision.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
