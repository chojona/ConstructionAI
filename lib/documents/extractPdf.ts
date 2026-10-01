import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { normalizePageText } from "./pageText";

const PDF_TEXT_EXTRACTOR_VERSION = "unpdf-text-v1";
const DEFAULT_CACHE_ENTRIES = 32;
const DEFAULT_CACHE_TEXT_BYTES = 16 * 1024 * 1024;

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPdfPage[];
  cacheStatus?: "hit" | "miss" | "coalesced";
}

export type PdfExtractor = (bytes: Buffer) => Promise<ExtractedPdf>;

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

/**
 * Reuses immutable parse results by content hash and coalesces concurrent work.
 * Failed parses are never cached, so a later retry gets a fresh attempt.
 */
export function createCachedPdfExtractor(options: {
  extract?: PdfExtractor;
  maxEntries?: number;
  maxTextBytes?: number;
} = {}): PdfExtractor {
  const extract = options.extract ?? extractPdfDocument;
  const maxEntries = positiveInteger(options.maxEntries ?? DEFAULT_CACHE_ENTRIES, "maxEntries");
  const maxTextBytes = positiveInteger(options.maxTextBytes ?? DEFAULT_CACHE_TEXT_BYTES, "maxTextBytes");
  const ready = new Map<string, { value: ExtractedPdf; textBytes: number }>();
  const inFlight = new Map<string, Promise<ExtractedPdf>>();
  let cachedTextBytes = 0;

  return async (bytes) => {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const key = `${PDF_TEXT_EXTRACTOR_VERSION}:${sha256}`;
    const cached = ready.get(key);
    if (cached) {
      ready.delete(key);
      ready.set(key, cached);
      return cloneExtractedPdf(cached.value, "hit");
    }

    const shared = inFlight.get(key);
    if (shared) return cloneExtractedPdf(await shared, "coalesced");

    const pending = extract(bytes).then((result) => {
      const snapshot = cloneExtractedPdf(result);
      const textBytes = snapshot.pages.reduce((sum, page) => sum + Buffer.byteLength(page.text), 0);
      if (textBytes <= maxTextBytes) {
        ready.set(key, { value: snapshot, textBytes });
        cachedTextBytes += textBytes;
        while (ready.size > maxEntries || cachedTextBytes > maxTextBytes) {
          const oldestKey = ready.keys().next().value as string | undefined;
          if (!oldestKey) break;
          const oldest = ready.get(oldestKey);
          ready.delete(oldestKey);
          cachedTextBytes -= oldest?.textBytes ?? 0;
        }
      }
      return snapshot;
    });
    inFlight.set(key, pending);
    try {
      return cloneExtractedPdf(await pending, "miss");
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  };
}

export const extractPdfDocumentCached = createCachedPdfExtractor();

function cloneExtractedPdf(result: ExtractedPdf, cacheStatus?: ExtractedPdf["cacheStatus"]): ExtractedPdf {
  return {
    pageCount: result.pageCount,
    pages: result.pages.map((page) => ({ ...page })),
    ...(cacheStatus ? { cacheStatus } : {}),
  };
}

function positiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}
