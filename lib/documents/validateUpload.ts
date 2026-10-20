import path from "node:path";
import { DomainError } from "@/lib/domain/errors";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } from "@/lib/documents/uploadLimit";

export function maxDocumentBytes(): number {
  const configured = Number(process.env.DOCUMENT_MAX_BYTES);
  const requested = Number.isFinite(configured) && configured > 0 ? configured : MAX_UPLOAD_BYTES;
  return Math.min(requested, MAX_UPLOAD_BYTES);
}

export function validatePdfUpload(input: {
  bytes: Buffer;
  mimeType: string;
  filename: string;
  maxBytes?: number;
}): void {
  const maxBytes = input.maxBytes ?? maxDocumentBytes();
  if (input.bytes.length === 0) {
    throw new DomainError("EMPTY_FILE", "The uploaded file is empty.", 400);
  }
  if (input.bytes.length > maxBytes) {
    const message = maxBytes >= MAX_UPLOAD_BYTES
      ? UPLOAD_TOO_LARGE_MESSAGE
      : `The PDF exceeds the ${maxBytes} byte limit.`;
    throw new DomainError("FILE_TOO_LARGE", message, 413);
  }
  if (input.mimeType.trim().toLowerCase() !== "application/pdf") {
    throw new DomainError("NOT_PDF", "Only PDF files are accepted.", 415);
  }
  const extension = path.extname(input.filename).toLowerCase();
  if (extension && extension !== ".pdf") {
    throw new DomainError("NOT_PDF", "The uploaded filename must use the .pdf extension.", 415);
  }
  if (input.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new DomainError("NOT_PDF", "The file does not contain a valid PDF signature.", 415);
  }
}
