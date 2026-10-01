import { isDomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import type { RevisionDetail } from "@/lib/domain/types";
import {
  runConstructionFactsExtraction,
  type ConstructionFactsModelClient,
} from "@/lib/extractions/constructionFacts";
import { deterministicConstructionFactsModel } from "@/lib/extractions/deterministicExtractor";
import type { ProcessingRun } from "@/lib/observability/pipelineTiming";
import { ingestRevision, type RevisionUploadInput } from "./ingestRevision";
import type { DocumentStorage } from "./storage";
import type { PdfExtractor } from "./extractPdf";

export async function publishRevision(
  organizationId: string,
  documentId: string,
  rawInput: RevisionUploadInput,
  dependencies: {
    repository?: ConstructionRepository;
    storage?: DocumentStorage;
    extract?: PdfExtractor;
    model?: ConstructionFactsModelClient;
    timings?: ProcessingRun;
  } = {},
): Promise<RevisionDetail> {
  const revision = await ingestRevision(organizationId, documentId, rawInput, dependencies);
  if (revision.status !== "PROCESSED") return revision;
  try {
    await runConstructionFactsExtraction({
      organizationId,
      documentRevisionId: revision.id,
      model: dependencies.model ?? deterministicConstructionFactsModel,
      repository: dependencies.repository,
      timings: dependencies.timings,
    });
  } catch (error) {
    if (!isDomainError(error)) throw error;
  }
  return revision;
}
