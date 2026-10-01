import { describe, expect, it } from "vitest";
import { createProject } from "@/lib/projects/service";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { createDocument, getDocument } from "./service";

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
});
