import type { RevisionDetail } from "@/lib/domain/types";

/** API representation intentionally omits internal storage keys and paths. */
export function toRevisionUploadDto(revision: RevisionDetail) {
  return {
    id: revision.id,
    documentId: revision.documentId,
    revisionLabel: revision.revisionLabel,
    revisionOrder: revision.revisionOrder,
    originalFilename: revision.originalFilename,
    byteSize: revision.byteSize,
    sha256: revision.sha256,
    status: revision.status,
    failureCode: revision.failureCode,
    failureMessage: revision.failureMessage,
    pageCount: revision.pages.length,
    createdAt: revision.createdAt,
  };
}
