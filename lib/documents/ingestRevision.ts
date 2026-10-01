import { createHash } from "node:crypto";
import { ZodError, z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { type ProcessingRun, withProcessingRun } from "@/lib/observability/pipelineTiming";
import { extractPdfDocumentCached, MAX_PDF_PAGES, PdfExtractionError, type PdfExtractor } from "./extractPdf";
import { hasUsableText } from "./pageText";
import { displayFilename, getDocumentStorage, type DocumentStorage } from "./storage";
import { validatePdfUpload } from "./validateUpload";

const revisionLabelSchema = z.string().trim().min(1).max(80);

function parseRevisionLabel(value: string) {
  try {
    return revisionLabelSchema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new DomainError("INVALID_INPUT", "Enter a revision label up to 80 characters.", 400);
    }
    throw error;
  }
}

export interface RevisionUploadInput {
  revisionLabel: string;
  originalFilename: string;
  mimeType: string;
  bytes: Buffer;
}

export async function ingestRevision(
  organizationId: string,
  documentId: string,
  rawInput: RevisionUploadInput,
  dependencies: {
    repository?: ConstructionRepository;
    storage?: DocumentStorage;
    extract?: PdfExtractor;
    timings?: ProcessingRun;
  } = {},
) {
  const repository = dependencies.repository ?? constructionRepository;
  const storage = dependencies.storage ?? getDocumentStorage();
  const extract = dependencies.extract ?? extractPdfDocumentCached;
  return withProcessingRun(dependencies.timings, "ingest", async (run) => {
    const document = await repository.getDocument(organizationId, documentId);
    if (!document) throw new DomainError("NOT_FOUND", "Document not found.", 404);

    const accepted = await run.stage("upload_validation", async () => {
      const revisionLabel = parseRevisionLabel(rawInput.revisionLabel);
      const originalFilename = displayFilename(rawInput.originalFilename);
      validatePdfUpload({
        bytes: rawInput.bytes,
        mimeType: rawInput.mimeType,
        filename: rawInput.originalFilename,
      });
      const sha256 = createHash("sha256").update(rawInput.bytes).digest("hex");
      if (await repository.findRevisionByHash(organizationId, documentId, sha256)) {
        throw new DomainError(
          "DUPLICATE_REVISION",
          "This exact PDF is already a revision of this document.",
          409,
        );
      }
      return { revisionLabel, originalFilename, sha256 };
    }, { byteSize: rawInput.bytes.length });

    const extracted = await run.stage("pdf_parsing", async () => {
      try {
        const parsed = await extract(rawInput.bytes);
        if (parsed.pageCount > MAX_PDF_PAGES || parsed.pages.length > MAX_PDF_PAGES) {
          throw new DomainError(
            "FILE_TOO_LARGE",
            `The PDF exceeds the ${MAX_PDF_PAGES} page limit.`,
            413,
          );
        }
        if (parsed.pages.length !== parsed.pageCount) {
          throw new DomainError(
            "MALFORMED_PDF",
            "The PDF did not produce one text result for every page.",
            422,
          );
        }
        return parsed;
      } catch (error) {
        if (error instanceof PdfExtractionError) {
          throw new DomainError("MALFORMED_PDF", "The PDF is malformed or unreadable.", 422);
        }
        throw error;
      }
    }, (result) => ({
      byteSize: rawInput.bytes.length,
      pageCount: result.pageCount,
      pageTextBytes: result.pages.reduce((sum, page) => sum + Buffer.byteLength(page.text), 0),
      pdfCacheHitCount: result.cacheStatus === "hit" ? 1 : 0,
      pdfCacheMissCount: result.cacheStatus === "miss" ? 1 : 0,
      pdfCacheCoalescedCount: result.cacheStatus === "coalesced" ? 1 : 0,
    }));

    const usableText = hasUsableText(extracted.pages);
    return run.stage("storage", async () => {
      const stored = await storage.put({ documentId, bytes: rawInput.bytes });
      try {
        return await repository.createRevision({
          documentId,
          revisionLabel: accepted.revisionLabel,
          originalFilename: accepted.originalFilename,
          mimeType: "application/pdf",
          byteSize: rawInput.bytes.length,
          sha256: accepted.sha256,
          storageKey: stored.storageKey,
          status: usableText ? "PROCESSED" : "FAILED",
          failureCode: usableText ? undefined : "SCANNED_OR_EMPTY",
          failureMessage: usableText
            ? undefined
            : "No usable embedded text was found. OCR is not available in Phase 1.",
          pages: extracted.pages.map((page) => ({
            ...page,
            textSha256: createHash("sha256").update(page.text).digest("hex"),
          })),
        });
      } catch (error) {
        await storage.delete(stored.storageKey).catch(() => undefined);
        throw error;
      }
    }, {
      byteSize: rawInput.bytes.length,
      pageCount: extracted.pageCount,
      pageTextBytes: extracted.pages.reduce((sum, page) => sum + Buffer.byteLength(page.text), 0),
    });
  });
}
