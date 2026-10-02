import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/errors";
import { S3ObjectStore, StorageObjectMissingError, type ObjectStore } from "@/lib/storage/objectStore";
import {
  PAGE_PREVIEW_DEFAULT_TTL_SECONDS,
  PAGE_PREVIEW_MAX_TTL_SECONDS,
  PAGE_PREVIEW_UNAVAILABLE_MESSAGE,
  openPagePreview,
  previewReadTtl,
  type PagePreviewRevision,
  type PagePreviewStore,
} from "./pagePreview";

const PDF = Buffer.from("%PDF-1.4 preview");

function revision(projectId = "project_1"): PagePreviewRevision {
  return {
    storageKey: "doc_1/file.pdf",
    mimeType: "application/pdf",
    originalFilename: "earthworks.pdf",
    document: {
      projectId,
      project: { id: projectId },
    },
  };
}

function repository(found: PagePreviewRevision | null = revision()) {
  const calls: string[] = [];
  return {
    calls,
    async getRevision(organizationId: string, revisionId: string) {
      calls.push(`${organizationId}:${revisionId}`);
      if (organizationId === "org_a" && revisionId === "rev_1" && found) return found;
      return null;
    },
  };
}

function store(options: { bytes?: Buffer | null; sign?: boolean } = {}): PagePreviewStore & { calls: string[] } {
  const bytes = options.bytes === undefined ? PDF : options.bytes;
  const calls: string[] = [];
  const base: ObjectStore = {
    mode: options.sign ? "s3" : "local",
    async put(storageKey) {
      calls.push(`put:${storageKey}`);
    },
    async get(storageKey) {
      calls.push(`get:${storageKey}`);
      if (!bytes || storageKey !== "doc_1/file.pdf") throw new StorageObjectMissingError(storageKey);
      return bytes;
    },
    async delete(storageKey) {
      calls.push(`delete:${storageKey}`);
    },
    async exists(storageKey) {
      calls.push(`exists:${storageKey}`);
      return Boolean(bytes) && storageKey === "doc_1/file.pdf";
    },
  };
  if (!options.sign) return Object.assign(base, { calls });
  return Object.assign(base, {
    calls,
    async signedReadUrl(storageKey: string, expiresInSeconds: number) {
      calls.push(`sign:${storageKey}:${expiresInSeconds}`);
      return `https://storage.example/uploads/${storageKey}?X-Amz-Expires=${expiresInSeconds}`;
    },
  });
}

describe("page preview access", () => {
  it("requires the organization before reading object bytes", async () => {
    const objects = store();
    const revisions = repository();
    await expect(openPagePreview({
      organizationId: "org_other",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 2,
      repository: revisions,
      objects,
    })).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
    expect(objects.calls).toEqual([]);
  });

  it("requires the revision to belong to the requested project", async () => {
    const objects = store();
    const revisions = repository();
    await expect(openPagePreview({
      organizationId: "org_a",
      projectId: "project_other",
      revisionId: "rev_1",
      pageNumber: 2,
      repository: revisions,
      objects,
    })).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
    expect(revisions.calls).toEqual(["org_a:rev_1"]);
    expect(objects.calls).toEqual([]);
  });

  it("streams the cited revision from the same object store", async () => {
    const objects = store();
    const preview = await openPagePreview({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 2,
      repository: repository(),
      objects,
      transport: "stream",
    });
    expect(preview).toEqual({
      kind: "stream",
      bytes: PDF,
      pageNumber: 2,
      contentType: "application/pdf",
      filename: "earthworks.pdf",
    });
    expect(objects.calls).toEqual(["get:doc_1/file.pdf"]);
  });

  it("signs a private read of at most one hour on that same store", async () => {
    const objects = store({ sign: true });
    const preview = await openPagePreview({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 4,
      repository: repository(),
      objects,
      transport: "signed-url",
    });
    expect(preview).toMatchObject({
      kind: "signed-url",
      pageNumber: 4,
      expiresInSeconds: PAGE_PREVIEW_DEFAULT_TTL_SECONDS,
      url: `https://storage.example/uploads/doc_1/file.pdf?X-Amz-Expires=${PAGE_PREVIEW_DEFAULT_TTL_SECONDS}`,
    });
    expect(PAGE_PREVIEW_DEFAULT_TTL_SECONDS).toBeLessThanOrEqual(PAGE_PREVIEW_MAX_TTL_SECONDS);
    expect(PAGE_PREVIEW_MAX_TTL_SECONDS).toBe(3600);
    expect(objects.calls).toEqual([
      `exists:doc_1/file.pdf`,
      `sign:doc_1/file.pdf:${PAGE_PREVIEW_DEFAULT_TTL_SECONDS}`,
    ]);

    objects.calls.length = 0;
    const hour = await openPagePreview({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 4,
      repository: repository(),
      objects,
      transport: "signed-url",
      expiresInSeconds: 3600,
    });
    expect(hour).toMatchObject({ kind: "signed-url", expiresInSeconds: 3600 });
    expect(objects.calls).toContain("sign:doc_1/file.pdf:3600");
  });

  it("rejects a signed read longer than one hour before touching storage", async () => {
    const objects = store({ sign: true });
    await expect(openPagePreview({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 4,
      repository: repository(),
      objects,
      transport: "signed-url",
      expiresInSeconds: 3601,
    })).rejects.toBeInstanceOf(DomainError);
    expect(objects.calls).toEqual([]);
    expect(() => previewReadTtl(3601)).toThrow(/one hour/);
  });

  it("does not fall back to another store when the object is missing", async () => {
    const objects = store({ bytes: null, sign: true });
    await expect(openPagePreview({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 2,
      repository: repository(),
      objects,
      transport: "stream",
    })).rejects.toMatchObject({
      code: "PAGE_PREVIEW_UNAVAILABLE",
      httpStatus: 404,
      message: PAGE_PREVIEW_UNAVAILABLE_MESSAGE,
    });
    await expect(openPagePreview({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 2,
      repository: repository(),
      objects,
      transport: "signed-url",
    })).rejects.toMatchObject({ code: "PAGE_PREVIEW_UNAVAILABLE" });
    expect(objects.calls).toEqual(["get:doc_1/file.pdf", "exists:doc_1/file.pdf"]);
    expect(PAGE_PREVIEW_UNAVAILABLE_MESSAGE).toBe("Page preview unavailable — open full document.");
  });

  it("uses the shared S3 store for a short signed GET and no second bucket", async () => {
    const shared = new S3ObjectStore({
      bucket: "uploads",
      region: "us-east-1",
      endpoint: "https://storage.neon.tech",
      forcePathStyle: true,
      accessKeyId: "neon-key",
      secretAccessKey: "neon-secret-value",
    });
    const url = await shared.signedReadUrl("doc_1/file.pdf", previewReadTtl(3600));
    expect(url).toContain("uploads");
    expect(url).toContain("doc_1/file.pdf");
    expect(url).toContain("X-Amz-Expires=3600");
    expect(url).not.toContain("neon-secret-value");

    const source = [
      "lib/review/pagePreview.ts",
      "lib/review/pagePreviewImage.ts",
      "app/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]/route.ts",
      "components/review/page-preview.tsx",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/new S3Client|new LocalObjectStore|createObjectStore|DOCUMENT_STORAGE_BUCKET|preview-bucket|PREVIEW_BUCKET/);
    expect(source).not.toMatch(/ask the pdf|pdf-chat|Ask about this page|prompt box/i);
    const route = readFileSync("app/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]/route.ts", "utf8");
    expect(route).toContain("requireObjectStore");
    expect(route).toContain("renderRevisionPageImage");
    expect(route).toContain('transport: "stream"');
  });
});
