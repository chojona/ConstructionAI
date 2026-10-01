import { describe, expect, it } from "vitest";
import {
  decisionReturnPath,
  evidenceHref,
  findingDomId,
  locateEvidenceSpan,
  pageSegments,
  parseEvidenceTarget,
  safeReturnPath,
  type EvidenceLocation,
} from "./evidenceLocation";

const excerpt = "Install 400 LF.";
const pageText = `${excerpt} Keep the first sentence.\n${excerpt}`;
const secondStart = pageText.lastIndexOf(excerpt);

const evidence: EvidenceLocation = {
  documentPageId: "page_2",
  pageNumber: 4,
  excerpt,
  startOffset: secondStart,
  endOffset: secondStart + excerpt.length,
  revisionId: "rev b",
  revisionLabel: "B",
  documentTitle: "Drainage Plan",
};

describe("evidence location", () => {
  it("jumps to the stored occurrence when the same excerpt appears twice", () => {
    const span = locateEvidenceSpan(pageText, secondStart, secondStart + excerpt.length, excerpt);
    expect(span).toEqual({ start: secondStart, end: secondStart + excerpt.length });
    expect(span?.start).not.toBe(pageText.indexOf(excerpt));
    expect(pageSegments(pageText, span).filter((segment) => segment.hit)).toEqual([{ text: excerpt, hit: true }]);
    expect(pageSegments(pageText, span)[0]?.text.startsWith(excerpt)).toBe(true);
  });

  it("refuses to highlight when the stored offsets do not reproduce the excerpt", () => {
    expect(locateEvidenceSpan(pageText, secondStart, secondStart + excerpt.length, "Install 500 LF.")).toBeNull();
    expect(locateEvidenceSpan(pageText, -1, excerpt.length, excerpt)).toBeNull();
    expect(locateEvidenceSpan(pageText, 0, pageText.length + 1, excerpt)).toBeNull();
  });

  it("builds a revision link from the stored page and offsets", () => {
    const href = evidenceHref(evidence, decisionReturnPath("proj_1", "proposed-fact:fact 1"));
    const url = new URL(href ?? "", "http://local");
    expect(url.pathname).toBe("/revisions/rev%20b");
    expect(url.searchParams.get("page")).toBe("page_2");
    expect(url.searchParams.get("start")).toBe(String(secondStart));
    expect(url.searchParams.get("end")).toBe(String(secondStart + excerpt.length));
    expect(url.searchParams.get("quote")).toBe(excerpt);
    expect(url.searchParams.get("return")).toBe(decisionReturnPath("proj_1", "proposed-fact:fact 1"));
    expect(url.hash).toBe("#evidence");
    expect(findingDomId("proposed-fact:fact 1")).toMatch(/^finding-[A-Za-z0-9_-]+$/);
  });

  it("keeps return links inside the project review", () => {
    const path = decisionReturnPath("proj_1", "proposed-fact:fact 1");
    expect(safeReturnPath(path)).toBe(path);
    expect(safeReturnPath("https://example.com")).toBeNull();
    expect(safeReturnPath("//example.com")).toBeNull();
    expect(safeReturnPath("/documents/doc_1")).toBeNull();
    expect(parseEvidenceTarget({ page: "page_2", start: String(secondStart), end: String(secondStart + excerpt.length), quote: excerpt })).toEqual({
      pageId: "page_2",
      start: secondStart,
      end: secondStart + excerpt.length,
      excerpt,
    });
    expect(parseEvidenceTarget({ page: "page_2", start: "1.5", end: "4", quote: excerpt })).toBeNull();
  });
});
