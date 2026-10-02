import { createHash } from "node:crypto";
import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import { validatePdfUpload } from "@/lib/documents/validateUpload";
import { displayFilename } from "@/lib/documents/storage";
import { writePacketBytes } from "@/lib/storage/packetBytes";
import { requireObjectStore, type ObjectStore } from "@/lib/storage/objectStore";
import {
  ACC_EXPORT_CHAPTER_TITLE,
  RFI_PDF_CHAPTER_TITLE,
  type AccChapterRole,
} from "./exportPacketView";
import { accChapterStorageKey } from "./exportPacket";
import { currentApprovedChangePacket, exportApprovedChangePacket, type Clock } from "./service";

const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export async function attachAccPdfChapter(
  organizationId: string,
  projectId: string,
  rawInput: {
    bytes: Buffer;
    filename: string;
    mimeType: string;
    sourceId?: string | null;
    role?: string | null;
    subjectKey?: string | null;
  },
  repository: ConstructionRepository = constructionRepository,
  objects: ObjectStore = requireObjectStore(),
  clock: Clock = () => new Date(),
) {
  const subjectKey = rawInput.subjectKey?.trim() || undefined;
  const role = parseRole(rawInput.role);
  const approved = await currentApprovedChangePacket(organizationId, projectId, repository, subjectKey);
  validatePdfUpload({
    bytes: rawInput.bytes,
    mimeType: rawInput.mimeType,
    filename: rawInput.filename,
  });
  const contentHash = createHash("sha256").update(rawInput.bytes).digest("hex");
  const sourceId = normalizeSourceId(rawInput.sourceId, contentHash);
  const fetchedAt = clock();
  const storageKey = accChapterStorageKey(projectId, contentHash);
  await writePacketBytes(objects, storageKey, rawInput.bytes);
  const saved = await repository.saveExportPacketChapter({
    organizationId,
    projectId,
    role,
    title: role === "rfi" ? RFI_PDF_CHAPTER_TITLE : ACC_EXPORT_CHAPTER_TITLE,
    sourceId,
    fetchedAt,
    contentHash,
    storageKey,
    filename: displayFilename(rawInput.filename),
    byteSize: rawInput.bytes.byteLength,
    reviewDecisionIds: approved.decisionIds,
  });
  if (!saved) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return exportApprovedChangePacket(organizationId, projectId, { subjectKey }, repository, () => fetchedAt);
}

function parseRole(raw: string | null | undefined): AccChapterRole {
  const value = raw?.trim() || "acc-docs";
  if (value !== "acc-docs" && value !== "rfi") {
    throw new DomainError("INVALID_INPUT", "Choose an ACC export or an RFI PDF.", 400);
  }
  return value;
}

function normalizeSourceId(raw: string | null | undefined, contentHash: string) {
  const sourceId = raw?.trim() ?? "";
  if (!sourceId) return `upload:${contentHash}`;
  if (!SOURCE_ID.test(sourceId)) {
    throw new DomainError("INVALID_INPUT", "Enter a source id for the ACC export.", 400);
  }
  return sourceId;
}
