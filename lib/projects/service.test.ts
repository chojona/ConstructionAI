import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { createProject, getProject, listProjects } from "./service";

describe("project service", () => {
  it("creates a project for an existing organization", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a");
    const project = await createProject("org_a", { name: " I-95 Bridge ", projectNumber: "DOT-42" }, repository);
    expect(project).toMatchObject({ organizationId: "org_a", name: "I-95 Bridge", projectNumber: "DOT-42" });
  });

  it("keeps project listings inside the organization boundary", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a"); repository.addOrganization("org_b");
    await createProject("org_a", { name: "Project A" }, repository);
    await createProject("org_b", { name: "Project B" }, repository);
    expect((await listProjects("org_a", repository)).map((project) => project.name)).toEqual(["Project A"]);
  });

  it("rejects cross-organization project access as not found", async () => {
    const repository = new MemoryRepository(); repository.addOrganization("org_a"); repository.addOrganization("org_b");
    const project = await createProject("org_a", { name: "Private project" }, repository);
    await expect(getProject("org_b", project.id, repository)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
