import { DomainError } from "@/lib/domain/errors";
import { StorageObjectMissingError, type ObjectStore } from "@/lib/storage/objectStore";
import { PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";

export { PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";

export const PAGE_PREVIEW_MAX_TTL_SECONDS = 60 * 60;
export const PAGE_PREVIEW_DEFAULT_TTL_SECONDS = 15 * 60;

export type PagePreviewStore = ObjectStore & {
  signedReadUrl?: (storageKey: string, expiresInSeconds: number) => Promise<string>;
};

export interface PagePreviewRevision {
  storageKey: string;
  mimeType: string;
  originalFilename: string;
  document: {
    projectId: string;
    project: { id: string };
  };
}

export type PagePreviewAccess =
  | {
    kind: "stream";
    bytes: Buffer;
    pageNumber: number;
    contentType: string;
    filename: string;
  }
  | {
    kind: "signed-url";
    url: string;
    expiresInSeconds: number;
    pageNumber: number;
  };

export function previewReadTtl(expiresInSeconds: number) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > PAGE_PREVIEW_MAX_TTL_SECONDS) {
    throw new DomainError("INVALID_INPUT", "Page preview links expire within one hour.", 400);
  }
  return expiresInSeconds;
}

function unavailable() {
  return new DomainError("PAGE_PREVIEW_UNAVAILABLE", PAGE_PREVIEW_UNAVAILABLE_MESSAGE, 404);
}

/** Reads one revision PDF from the shared private object store after org and project checks. */
export async function openPagePreview(input: {
  organizationId: string;
  projectId: string;
  revisionId: string;
  pageNumber: number;
  repository: {
    getRevision(organizationId: string, revisionId: string): Promise<PagePreviewRevision | null>;
  };
  objects: PagePreviewStore;
  transport?: "stream" | "signed-url";
  expiresInSeconds?: number;
}): Promise<PagePreviewAccess> {
  if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1) {
    throw new DomainError("INVALID_INPUT", "Page preview requires a page number.", 400);
  }
  const sign = input.transport === "signed-url" && typeof input.objects.signedReadUrl === "function"
    ? input.objects.signedReadUrl.bind(input.objects)
    : null;
  const expiresInSeconds = sign
    ? previewReadTtl(input.expiresInSeconds ?? PAGE_PREVIEW_DEFAULT_TTL_SECONDS)
    : null;

  const revision = await input.repository.getRevision(input.organizationId, input.revisionId);
  if (!revision || revision.document.project.id !== input.projectId) {
    throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  }

  if (sign && expiresInSeconds !== null) {
    if (!(await input.objects.exists(revision.storageKey))) throw unavailable();
    return {
      kind: "signed-url",
      url: await sign(revision.storageKey, expiresInSeconds),
      expiresInSeconds,
      pageNumber: input.pageNumber,
    };
  }

  try {
    const bytes = await input.objects.get(revision.storageKey);
    return {
      kind: "stream",
      bytes,
      pageNumber: input.pageNumber,
      contentType: revision.mimeType || "application/pdf",
      filename: revision.originalFilename,
    };
  } catch (error) {
    if (error instanceof StorageObjectMissingError) throw unavailable();
    throw error;
  }
}
