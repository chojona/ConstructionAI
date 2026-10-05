import { describe, expect, it } from "vitest";
import { createProject } from "@/lib/projects/service";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { createDocument, getDocument, listDocumentRegister } from "./service";

describe("document service", () => {
  it("creates a logical document under the selected project", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a");
    const project = await createProject("org_a", { name: "Bridge" }, repository);
    const document = await createDocument("org_a", project.id, { title: "Drainage Plan", documentType: "Plan set" }, repository);
    expect(document).toMatchObject({ projectId: project.id, title: "Drainage Plan", documentType: "Plan set" });
  });

  it("does not silently merge logical documents with the same title", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a");
    const project = await createProject("org_a", { name: "Bridge" }, repository);
    const first = await createDocument("org_a", project.id, { title: "Drainage Plan" }, repository);
    const second = await createDocument("org_a", project.id, { title: "Drainage Plan" }, repository);
    expect(first.id).not.toBe(second.id);
  });

  it("enforces project and document ownership", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a"); repository.addOrganization("org_b");
    const project = await createProject("org_a", { name: "Bridge" }, repository);
    await expect(createDocument("org_b", project.id, { title: "Stolen" }, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const document = await createDocument("org_a", project.id, { title: "Drainage Plan" }, repository);
    await expect(getDocument("org_b", document.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("loads register revisions for the owning organization only", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a"); repository.addOrganization("org_b");
    const project = await createProject("org_a", { name: "Bridge" }, repository);
    const document = await createDocument("org_a", project.id, { title: "Drainage Plan", documentType: "Plan" }, repository);
    await repository.createRevision({
      documentId: document.id,
      revisionLabel: "B",
      originalFilename: "drainage.pdf",
      mimeType: "application/pdf",
      byteSize: 20,
      sha256: "abc",
      storageKey: "doc/b.pdf",
      status: "PROCESSED",
      pages: [
        { pageNumber: 1, text: "page one", textSha256: "p1" },
        { pageNumber: 2, text: "page two", textSha256: "p2" },
      ],
    });
    const register = await listDocumentRegister("org_a", project.id, repository);
    expect(register).toEqual([expect.objectContaining({
      id: document.id,
      title: "Drainage Plan",
      documentType: "Plan",
      revisions: [expect.objectContaining({ revisionLabel: "B", status: "PROCESSED", pageCount: 2 })],
    })]);
    await expect(listDocumentRegister("org_b", project.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
