import { describe, expect, it } from "vitest";
import { createCachedPdfExtractor, extractPdfDocument } from "./extractPdf";
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

  it("reuses content-addressed results without sharing mutable page objects", async () => {
    let calls = 0;
    const cached = createCachedPdfExtractor({
      extract: async () => {
        calls += 1;
        return { pageCount: 1, pages: [{ pageNumber: 1, text: "Original" }] };
      },
    });
    const bytes = Buffer.from("same-pdf");
    const first = await cached(bytes);
    first.pages[0]!.text = "mutated by caller";
    const second = await cached(bytes);

    expect(calls).toBe(1);
    expect(first.cacheStatus).toBe("miss");
    expect(second).toEqual({
      pageCount: 1,
      pages: [{ pageNumber: 1, text: "Original" }],
      cacheStatus: "hit",
    });
  });

  it("coalesces concurrent parses of identical bytes", async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const cached = createCachedPdfExtractor({
      extract: async () => {
        calls += 1;
        await blocked;
        return { pageCount: 1, pages: [{ pageNumber: 1, text: "Shared" }] };
      },
    });
    const bytes = Buffer.from("same-concurrent-pdf");
    const first = cached(bytes);
    const second = cached(bytes);
    expect(calls).toBe(1);
    release();

    const [parsed, coalesced] = await Promise.all([first, second]);
    expect(parsed.cacheStatus).toBe("miss");
    expect(coalesced.cacheStatus).toBe("coalesced");
    expect(coalesced.pages).toEqual(parsed.pages);
  });

  it("does not cache failed work and retries cleanly", async () => {
    let calls = 0;
    const cached = createCachedPdfExtractor({
      extract: async () => {
        calls += 1;
        if (calls === 1) throw new PdfTestError();
        return { pageCount: 1, pages: [{ pageNumber: 1, text: "Recovered" }] };
      },
    });
    const bytes = Buffer.from("retry-pdf");

    await expect(cached(bytes)).rejects.toThrow("parse failed");
    await expect(cached(bytes)).resolves.toMatchObject({ cacheStatus: "miss", pageCount: 1 });
    await expect(cached(bytes)).resolves.toMatchObject({ cacheStatus: "hit", pageCount: 1 });
    expect(calls).toBe(2);
  });

  it("evicts least-recently-used results at the configured bound", async () => {
    let calls = 0;
    const cached = createCachedPdfExtractor({
      maxEntries: 1,
      extract: async (bytes) => {
        calls += 1;
        return { pageCount: 1, pages: [{ pageNumber: 1, text: bytes.toString() }] };
      },
    });

    await cached(Buffer.from("first"));
    await cached(Buffer.from("second"));
    await cached(Buffer.from("first"));
    expect(calls).toBe(3);
  });
});

class PdfTestError extends Error {
  constructor() {
    super("parse failed");
  }
}
