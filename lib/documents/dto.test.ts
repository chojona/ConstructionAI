import { describe, expect, it } from "vitest";
import { toRevisionUploadDto } from "./dto";

describe("revision API DTO", () => {
  it("never exposes the internal storage key", () => {
    const dto = toRevisionUploadDto({
      id: "revision_1", documentId: "document_1", revisionLabel: "A", revisionOrder: 1,
      originalFilename: "plan.pdf", mimeType: "application/pdf", byteSize: 100,
      sha256: "abc", storageKey: "document_1/private.pdf", status: "PROCESSED",
      failureCode: null, failureMessage: null, createdAt: new Date("2026-09-30T00:00:00Z"),
      document: {
        id: "document_1", projectId: "project_1", title: "Plan", documentType: null,
        createdAt: new Date("2026-09-30T00:00:00Z"), updatedAt: new Date("2026-09-30T00:00:00Z"),
        project: { id: "project_1", name: "Bridge" },
      },
      pages: [],
    });
    expect(dto).not.toHaveProperty("storageKey");
    expect(dto).toMatchObject({ id: "revision_1", pageCount: 0 });
  });
});
