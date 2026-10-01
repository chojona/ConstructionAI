import { describe, expect, it } from "vitest";
import { portfolioUploadHref, uploadRevisionHref } from "./emptyState";

describe("upload revision links", () => {
  it("opens the documents tab when the project has no document yet", () => {
    expect(uploadRevisionHref("project_1", [])).toBe("/projects/project_1?view=documents");
  });

  it("opens the first revision upload on a document that has none", () => {
    expect(uploadRevisionHref("project_1", [
      { id: "doc_ready", revisionCount: 2 },
      { id: "doc_new", revisionCount: 0 },
    ])).toBe("/documents/doc_new?upload=1");
  });

  it("points the portfolio empty state at a project that still needs an upload", () => {
    expect(portfolioUploadHref([
      { id: "reviewed", documentCount: 1 },
      { id: "blank", documentCount: 0 },
    ])).toBe("/projects/blank?view=documents");
    expect(portfolioUploadHref([])).toBe("/projects");
  });
});
