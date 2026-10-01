import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { createDocument } from "@/lib/documents/service";
import { LocalDocumentStorage } from "@/lib/documents/storage";
import { createProject } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { getProjectReview } from "@/lib/review/service";
import { buildTextPdf } from "./minimalPdf";
import { publishRevision } from "./publishRevision";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("publish revision", () => {
  it("extracts both revisions so the quantity change is ready to review", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const project = await createProject("org_a", { name: "Bridge" }, repository);
    const document = await createDocument("org_a", project.id, { title: "Earthworks" }, repository);
    const root = await mkdtemp(path.join(tmpdir(), "construction-publish-"));
    roots.push(root);
    const storage = new LocalDocumentStorage(root);
    const upload = (label: string, text: string) => publishRevision("org_a", document.id, {
      revisionLabel: label,
      originalFilename: `${label}.pdf`,
      mimeType: "application/pdf",
      bytes: buildTextPdf([text]),
    }, { repository, storage });

    await upload("Rev A", "Excavation quantity is 1250 CY.");
    await upload("Rev B", "Excavation quantity is 1500 CY.");

    const review = await getProjectReview("org_a", project.id, repository);
    const attention = listAttention(review.findings);
    expect(attention.map((item) => item.finding.label)).toContain("excavation: 1500 CY");
    expect(attention.some((item) => item.severity === "high")).toBe(true);
  });
});
