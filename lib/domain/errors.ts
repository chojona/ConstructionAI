export type DomainErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "NOT_PDF"
  | "MALFORMED_PDF"
  | "DUPLICATE_REVISION"
  | "REVISION_LABEL_CONFLICT"
  | "SCANNED_OR_EMPTY"
  | "STORAGE_ERROR";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
