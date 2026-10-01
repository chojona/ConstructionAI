import { extractText, getDocumentProxy } from "unpdf";
import { normalizePageText } from "./pageText";

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPdfPage[];
}

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

/** Extracts embedded text per page. Image-only pages stay empty; no OCR occurs. */
export async function extractPdfDocument(bytes: Buffer): Promise<ExtractedPdf> {
  try {
    const document = await getDocumentProxy(new Uint8Array(bytes));
    try {
      const result = await extractText(document, { mergePages: false });
      const texts = Array.isArray(result.text) ? result.text : [result.text];
      const pageCount = Math.max(result.totalPages, texts.length);
      return {
        pageCount,
        pages: Array.from({ length: pageCount }, (_, index) => ({
          pageNumber: index + 1,
          text: normalizePageText(texts[index] ?? ""),
        })),
      };
    } finally {
      const destroy = (document as { destroy?: () => Promise<void> | void }).destroy;
      if (typeof destroy === "function") await destroy.call(document);
    }
  } catch (error) {
    throw new PdfExtractionError(
      error instanceof Error ? error.message : "PDF text extraction failed",
    );
  }
}
