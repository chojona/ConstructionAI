import { describe, expect, it } from "vitest";
import { extractPdfDocument } from "./extractPdf";
import { buildTextPdf } from "./minimalPdf";

describe("extractPdfDocument", () => {
  it("extracts embedded construction text", async () => {
    const result = await extractPdfDocument(buildTextPdf(["Storm drain invert: 84.25 FT"]));
    expect(result.pageCount).toBe(1);
    expect(result.pages[0]?.text).toBe("Storm drain invert: 84.25 FT");
  });

  it("preserves page numbers and page boundaries", async () => {
    const result = await extractPdfDocument(buildTextPdf(["Demolition notes", "Proposed drainage plan"]));
    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      { pageNumber: 1, text: "Demolition notes" },
      { pageNumber: 2, text: "Proposed drainage plan" },
    ]);
    expect(result.pages[0]?.text).not.toContain("drainage");
  });

  it("leaves image-only or empty page text empty", async () => {
    const result = await extractPdfDocument(buildTextPdf(["   "]));
    expect(result.pages[0]?.text).toBe("");
  });
});
