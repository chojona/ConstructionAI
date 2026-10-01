import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/projects/service";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { startProcessingRun } from "@/lib/observability/pipelineTiming";
import { createDocument } from "./service";
import { ingestRevision } from "./ingestRevision";
import { buildTextPdf } from "./minimalPdf";
import { LocalDocumentStorage } from "./storage";
import { createCachedPdfExtractor } from "./extractPdf";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup() {
  const repository = new MemoryRepository(); repository.addOrganization("org_a"); repository.addOrganization("org_b");
  const project = await createProject("org_a", { name: "Bridge" }, repository);
  const document = await createDocument("org_a", project.id, { title: "Drainage Plan" }, repository);
  const root = await mkdtemp(path.join(tmpdir(), "construction-ingest-")); roots.push(root);
  return { repository, project, document, storage: new LocalDocumentStorage(root) };
}

describe("revision ingestion", () => {
  it("attaches a PDF to the correct logical document and persists its hash and pages", async () => {
    const { repository, document, storage } = await setup();
    const revision = await ingestRevision("org_a", document.id, {
      revisionLabel: "Revision A", originalFilename: "drainage-a.pdf", mimeType: "application/pdf",
      bytes: buildTextPdf(["Sheet C-101", "Drainage quantities"]),
    }, { repository, storage });
    expect(revision.documentId).toBe(document.id);
    expect(revision.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(revision.status).toBe("PROCESSED");
    expect(revision.pages.map((page) => [page.pageNumber, page.text])).toEqual([[1, "Sheet C-101"], [2, "Drainage quantities"]]);
    expect(revision.pages[0]?.textSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects the exact binary twice within the same document", async () => {
    const { repository, document, storage } = await setup();
    const bytes = buildTextPdf(["Same source"]);
    await ingestRevision("org_a", document.id, { revisionLabel: "A", originalFilename: "a.pdf", mimeType: "application/pdf", bytes }, { repository, storage });
    await expect(ingestRevision("org_a", document.id, { revisionLabel: "B", originalFilename: "renamed.pdf", mimeType: "application/pdf", bytes }, { repository, storage }))
      .rejects.toMatchObject({ code: "DUPLICATE_REVISION" });
    expect(repository.revisions).toHaveLength(1);
  });

  it("coalesces concurrent parsing without creating duplicate revisions", async () => {
    const { repository, document, storage } = await setup();
    let parseCalls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const extract = createCachedPdfExtractor({
      extract: async () => {
        parseCalls += 1;
        await blocked;
        return { pageCount: 1, pages: [{ pageNumber: 1, text: "Shared source" }] };
      },
    });
    const bytes = buildTextPdf(["Shared source"]);
    const first = ingestRevision("org_a", document.id, {
      revisionLabel: "A", originalFilename: "a.pdf", mimeType: "application/pdf", bytes,
    }, { repository, storage, extract });
    const second = ingestRevision("org_a", document.id, {
      revisionLabel: "B", originalFilename: "b.pdf", mimeType: "application/pdf", bytes,
    }, { repository, storage, extract });
    await Promise.resolve();
    release();

    const results = await Promise.allSettled([first, second]);
    expect(parseCalls).toBe(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "DUPLICATE_REVISION" },
    });
    expect(repository.revisions).toHaveLength(1);
    expect(repository.pages).toHaveLength(1);
  });

  it("assigns deterministic order and leaves old revisions unchanged", async () => {
    const { repository, document, storage } = await setup();
    const first = await ingestRevision("org_a", document.id, { revisionLabel: "A", originalFilename: "a.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Original"] ) }, { repository, storage });
    const snapshot = structuredClone(first);
    const second = await ingestRevision("org_a", document.id, { revisionLabel: "B", originalFilename: "b.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Revised"] ) }, { repository, storage });
    expect([first.revisionOrder, second.revisionOrder]).toEqual([1, 2]);
    expect(await repository.getRevision("org_a", first.id)).toEqual(snapshot);
  });

  it("rejects reuse of a revision label for a different binary", async () => {
    const { repository, document, storage } = await setup();
    await ingestRevision("org_a", document.id, { revisionLabel: "A", originalFilename: "a.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Original"]) }, { repository, storage });
    await expect(ingestRevision("org_a", document.id, { revisionLabel: "A", originalFilename: "a2.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Different"]) }, { repository, storage }))
      .rejects.toMatchObject({ code: "REVISION_LABEL_CONFLICT" });
    expect(repository.revisions).toHaveLength(1);
  });

  it("records scanned or textless PDFs with an explicit failure", async () => {
    const { repository, document, storage } = await setup();
    const revision = await ingestRevision("org_a", document.id, { revisionLabel: "Scan", originalFilename: "scan.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["   "]) }, { repository, storage });
    expect(revision).toMatchObject({ status: "FAILED", failureCode: "SCANNED_OR_EMPTY" });
    expect(revision.pages).toHaveLength(1);
  });

  it("rejects malformed PDFs without persisting a revision", async () => {
    const { repository, document, storage } = await setup();
    await expect(ingestRevision("org_a", document.id, { revisionLabel: "Bad", originalFilename: "bad.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-not-really") }, { repository, storage }))
      .rejects.toMatchObject({ code: "MALFORMED_PDF" });
    expect(repository.revisions).toHaveLength(0);
  });

  it("rejects cross-organization revision uploads", async () => {
    const { repository, document, storage } = await setup();
    await expect(ingestRevision("org_b", document.id, { revisionLabel: "A", originalFilename: "a.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Private"]) }, { repository, storage }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sanitizes a traversal filename while retaining safe display metadata", async () => {
    const { repository, document, storage } = await setup();
    const revision = await ingestRevision("org_a", document.id, { revisionLabel: "A", originalFilename: "../../secrets.pdf", mimeType: "application/pdf", bytes: buildTextPdf(["Safe"]) }, { repository, storage });
    expect(revision.originalFilename).toBe("secrets.pdf");
    expect(revision.storageKey).not.toContain("..");
  });

  it("records upload, parse, and storage timings without the page text", async () => {
    const { repository, document, storage } = await setup();
    const secret = "CONFIDENTIAL-DRAWING-ALPHA";
    const timings = startProcessingRun({ kind: "ingest" });
    const bytes = buildTextPdf([secret]);
    await ingestRevision("org_a", document.id, {
      revisionLabel: "A", originalFilename: "secret.pdf", mimeType: "application/pdf", bytes,
    }, { repository, storage, timings });
    const timing = timings.finish();
    expect(timing.outcome).toBe("success");
    expect(timing.stages.map((stage) => stage.stage)).toEqual(["upload_validation", "pdf_parsing", "storage"]);
    expect(timing.context.byteSize).toBe(bytes.length);
    expect(timing.context.pageCount).toBe(1);
    expect(JSON.stringify(timing)).not.toContain(secret);
    expect(JSON.stringify(timing)).not.toContain("secret.pdf");
  });
});
