import { createHash } from "node:crypto";
import path from "node:path";
import { DomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import { maxDocumentBytes, validatePdfUpload } from "@/lib/documents/validateUpload";
import { displayFilename } from "@/lib/documents/storage";
import { extractPdfDocument } from "@/lib/documents/extractPdf";
import { writePacketBytes } from "@/lib/storage/packetBytes";
import { requireObjectStore, type ObjectStore } from "@/lib/storage/objectStore";
import { APPENDIX_PAGE_MISSING_MESSAGE, BLUEBEAM_APPENDIX_ROLE, BLUEBEAM_MARKUP_APPENDIX_TITLE, bindMarkupPageCites, factPageCites } from "./exportPacketView";
import { appendixStorageKey } from "./exportPacket";
import { currentApprovedChangePacket, exportApprovedChangePacket, type Clock } from "./service";

const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_PAGE_CITES = 500;
const LABELED_PAGE = /^page(?:\s+label)?\s*[:#]\s*(.+)$/i;
const PAGE_ONLY = /^page\s+(\d+[A-Za-z0-9./_-]*)\s*$/i;
const PAGE_HEADER = /^page(?:\s+label)?$/i;

export async function attachBluebeamMarkupAppendix(
  organizationId: string,
  projectId: string,
  rawInput: {
    bytes: Buffer;
    filename: string;
    mimeType: string;
    sourceId?: string | null;
    subjectKey?: string | null;
    kind?: string | null;
  },
  repository: ConstructionRepository = constructionRepository,
  objects: ObjectStore = requireObjectStore(),
  clock: Clock = () => new Date(),
) {
  const kind = rawInput.kind?.trim();
  if (kind && kind !== BLUEBEAM_APPENDIX_ROLE) {
    throw new DomainError("INVALID_INPUT", "Choose a Markup Summary.", 400);
  }
  const subjectKey = rawInput.subjectKey?.trim() || undefined;
  const approved = await currentApprovedChangePacket(organizationId, projectId, repository, subjectKey);
  const markup = await readMarkupSummary(rawInput);
  const fromFact = factPageCites(approved.changes.flatMap((change) => change.evidence));
  const pageCites = bindMarkupPageCites(markupSummaryPageCites(markup.text), fromFact);
  if (pageCites.length === 0) {
    throw new DomainError("INVALID_INPUT", APPENDIX_PAGE_MISSING_MESSAGE, 400);
  }
  if (pageCites.length > MAX_PAGE_CITES) {
    throw new DomainError("INVALID_INPUT", "The markup summary has too many page cites.", 400);
  }
  const contentHash = createHash("sha256").update(rawInput.bytes).digest("hex");
  const sourceId = normalizeSourceId(rawInput.sourceId, contentHash);
  const fetchedAt = clock();
  const storageKey = appendixStorageKey(projectId, contentHash, markup.extension);
  await writePacketBytes(objects, storageKey, rawInput.bytes);
  const saved = await repository.saveExportPacketChapter({
    organizationId,
    projectId,
    role: BLUEBEAM_APPENDIX_ROLE,
    title: BLUEBEAM_MARKUP_APPENDIX_TITLE,
    sourceId,
    fetchedAt,
    contentHash,
    storageKey,
    filename: displayFilename(rawInput.filename),
    byteSize: rawInput.bytes.byteLength,
    pageCites,
    reviewDecisionIds: approved.decisionIds,
  });
  if (!saved) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return exportApprovedChangePacket(organizationId, projectId, { subjectKey }, repository, () => fetchedAt);
}

export function markupSummaryPageCites(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const labeled = unique(lines.flatMap((line) => {
    const match = line.match(LABELED_PAGE) ?? line.match(PAGE_ONLY);
    const cite = match ? cleanCite(match[1] ?? "") : null;
    return cite ? [cite] : [];
  }));
  if (labeled.length > 0) return labeled;

  const headerIndex = lines.findIndex((line) => headerColumn(line) !== null);
  if (headerIndex < 0) return [];
  const header = headerColumn(lines[headerIndex] ?? "");
  if (!header) return [];
  const cites: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitColumns(line, header.style);
    const cite = cleanCite(cells[header.index] ?? "");
    if (!cite || PAGE_HEADER.test(cite)) continue;
    cites.push(cite);
  }
  return unique(cites);
}

async function readMarkupSummary(input: { bytes: Buffer; filename: string; mimeType: string }) {
  const extension = path.extname(input.filename).toLowerCase();
  const mime = input.mimeType.trim().toLowerCase();
  const pdfSignature = input.bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  const csvMime = mime === "text/csv" || mime === "application/csv" || mime === "text/plain" || mime === "application/vnd.ms-excel" || mime === "";
  if (!pdfSignature && extension === ".csv" && csvMime) {
    return { extension: "csv" as const, text: validateTextExport(input.bytes) };
  }
  if (pdfSignature || mime === "application/pdf" || extension === ".pdf") {
    validatePdfUpload({ ...input, mimeType: "application/pdf" });
    try {
      const extracted = await extractPdfDocument(input.bytes);
      return { extension: "pdf" as const, text: extracted.pages.map((page) => page.text).join("\n") };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("INVALID_INPUT", "The markup summary could not be read.", 400);
    }
  }
  throw new DomainError("INVALID_INPUT", "Upload a markup summary PDF or CSV export.", 415);
}

function validateTextExport(bytes: Buffer) {
  const maxBytes = maxDocumentBytes();
  if (bytes.length === 0) throw new DomainError("EMPTY_FILE", "The uploaded file is empty.", 400);
  if (bytes.length > maxBytes) throw new DomainError("FILE_TOO_LARGE", `The file exceeds the ${maxBytes} byte limit.`, 413);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DomainError("INVALID_INPUT", "The markup summary could not be read.", 400);
  }
}

function normalizeSourceId(raw: string | null | undefined, contentHash: string) {
  const sourceId = raw?.trim() ?? "";
  if (!sourceId) return `upload:${contentHash}`;
  if (!SOURCE_ID.test(sourceId)) {
    throw new DomainError("INVALID_INPUT", "Enter a source id for the markup summary.", 400);
  }
  return sourceId;
}

type ColumnSplit = "tab" | "comma" | "spaces" | "tokens";

function headerColumn(line: string): { style: ColumnSplit; index: number } | null {
  const styles: ColumnSplit[] = [];
  if (line.includes("\t")) styles.push("tab");
  if (line.includes(",")) styles.push("comma");
  if (/\s{2,}/.test(line)) styles.push("spaces");
  styles.push("tokens");
  for (const style of styles) {
    const cells = splitColumns(line, style);
    const index = cells.findIndex((cell) => PAGE_HEADER.test(cell));
    if (index === 0) return { style, index };
  }
  return null;
}

function splitColumns(line: string, style: ColumnSplit) {
  if (style === "tab") return line.split("\t").map((cell) => cell.trim());
  if (style === "comma") return splitCsv(line);
  if (style === "spaces") return line.split(/\s{2,}/).map((cell) => cell.trim()).filter((cell) => cell.length > 0);
  return line.split(/\s+/).filter((cell) => cell.length > 0);
}

function splitCsv(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (quoted) {
      if (char === "\"") {
        if (line[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function cleanCite(raw: string) {
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value || value.length > 80 || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

function unique(cites: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const cite of cites) {
    const key = cite.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cite);
  }
  return result;
}
