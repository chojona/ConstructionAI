import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/errors";
import { MAX_UPLOAD_BYTES } from "./uploadLimit";
import { buildTextPdf } from "./minimalPdf";
import { maxDocumentBytes, validatePdfUpload } from "./validateUpload";

const valid = () => ({ bytes: buildTextPdf(["Plan notes"]), mimeType: "application/pdf", filename: "plan.pdf" });
function expectCode(run: () => void, code: string) {
  try { run(); throw new Error("Expected rejection"); }
  catch (error) { expect(error).toBeInstanceOf(DomainError); expect((error as DomainError).code).toBe(code); }
}

describe("PDF upload validation", () => {
  it("caps the configured byte limit at the platform upload size", () => {
    const previous = process.env.DOCUMENT_MAX_BYTES;
    try {
      delete process.env.DOCUMENT_MAX_BYTES;
      expect(maxDocumentBytes()).toBe(MAX_UPLOAD_BYTES);
      process.env.DOCUMENT_MAX_BYTES = "20971520";
      expect(maxDocumentBytes()).toBe(MAX_UPLOAD_BYTES);
      process.env.DOCUMENT_MAX_BYTES = "1024";
      expect(maxDocumentBytes()).toBe(1024);
    } finally {
      if (previous === undefined) delete process.env.DOCUMENT_MAX_BYTES;
      else process.env.DOCUMENT_MAX_BYTES = previous;
    }
  });
  it("accepts a valid PDF", () => expect(() => validatePdfUpload(valid())).not.toThrow());
  it("rejects an empty file", () => expectCode(() => validatePdfUpload({ ...valid(), bytes: Buffer.alloc(0) }), "EMPTY_FILE"));
  it("rejects an oversized file", () => expectCode(() => validatePdfUpload({ ...valid(), maxBytes: 20 }), "FILE_TOO_LARGE"));
  it("rejects a fake browser MIME", () => expectCode(() => validatePdfUpload({ ...valid(), mimeType: "text/plain" }), "NOT_PDF"));
  it("rejects non-PDF bytes with a PDF MIME", () => expectCode(() => validatePdfUpload({ ...valid(), bytes: Buffer.from("not pdf") }), "NOT_PDF"));
  it("rejects a conflicting extension", () => expectCode(() => validatePdfUpload({ ...valid(), filename: "plan.txt" }), "NOT_PDF"));
});
