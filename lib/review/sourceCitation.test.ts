import { describe, expect, it } from "vitest";
import { pinnedSourceCitation } from "./sourceCitation";

describe("pinned source citation", () => {
  it("cites the document, revision, and page", () => {
    expect(pinnedSourceCitation({
      documentTitle: "Earthworks specification",
      revisionLabel: "Rev 04",
      revisionId: "rev_04",
      pageNumber: 3,
    })).toBe("Earthworks specification · Rev 04 · p. 3");
  });

  it("omits a page that is not pinned to a document revision", () => {
    expect(pinnedSourceCitation({
      documentTitle: "Earthworks specification",
      revisionLabel: "Rev A → Rev B",
      revisionId: null,
      pageNumber: 3,
    })).toBeNull();
    expect(pinnedSourceCitation({
      documentTitle: "Earthworks specification",
      revisionLabel: "   ",
      revisionId: "rev_04",
      pageNumber: 3,
    })).toBeNull();
    expect(pinnedSourceCitation({
      documentTitle: "Earthworks specification",
      revisionLabel: "Rev 04",
      revisionId: "rev_04",
      pageNumber: 0,
    })).toBeNull();
  });
});
