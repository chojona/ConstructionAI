import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONSTRUCTION_FACTS_EXTRACTOR, runConstructionFactsExtraction, type ConstructionFactsModelClient } from "@/lib/extractions/constructionFacts";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { createDocument } from "@/lib/documents/service";
import { ingestRevision } from "@/lib/documents/ingestRevision";
import type { DocumentStorage } from "@/lib/documents/storage";
import { createProject } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { getProjectReview } from "@/lib/review/service";
import { compareRevisionFacts } from "@/lib/revisions/compareFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { formatLatencyReport, summarizeLatency, type LatencySummary } from "./latencyReport";
import { isPipelineTimeout, startProcessingRun, type ProcessingRun, type ProcessingRunTiming } from "./pipelineTiming";

const ORGANIZATION_ID = "org_bench";

export async function runLatencyBenchmark(input: {
  iterations?: number;
  pages?: number;
  repository?: MemoryRepository;
  storage: DocumentStorage;
}): Promise<{ runs: ProcessingRunTiming[]; summary: LatencySummary; report: string }> {
  const iterations = input.iterations ?? 11;
  const pages = input.pages ?? 8;
  const repository = input.repository ?? new MemoryRepository();
  if (!repository.organizations.has(ORGANIZATION_ID)) {
    repository.addOrganization(ORGANIZATION_ID);
  }
  const model = localModel();
  const runs: ProcessingRunTiming[] = [];
  const warmup = startProcessingRun({ kind: "document_intelligence_warmup" });
  const warmupProject = await createProject(ORGANIZATION_ID, { name: "Latency warmup" }, repository);
  await measureOnce({ repository, storage: input.storage, projectId: warmupProject.id, pages, model, timings: warmup });
  const warmupParseMs = warmup.finish().stages
    .filter((stage) => stage.stage === "pdf_parsing")
    .reduce((sum, stage) => sum + stage.durationMs, 0);

  for (let index = 0; index < iterations; index += 1) {
    const project = await createProject(ORGANIZATION_ID, { name: "Latency baseline" }, repository);
    const timings = startProcessingRun({ kind: "document_intelligence" });
    try {
      const measured = await measureOnce({ repository, storage: input.storage, projectId: project.id, pages, model, timings });
      timings.note({ byteSize: measured.byteSize, pageCount: measured.pageCount, pageTextBytes: measured.pageTextBytes });
      runs.push(timings.finish());
    } catch (error) {
      runs.push(timings.finish(isPipelineTimeout(error) ? "timeout" : "failure"));
      throw error;
    }
  }

  const summary = summarizeLatency(runs);
  return {
    runs,
    summary,
    report: formatLatencyReport(summary, {
      generatedAt: new Date().toISOString(),
      iterations,
      workload: workloadLines(runs, pages),
      notes: [
        `Runtime ${process.version} on ${process.platform}/${process.arch}.`,
        `One warmup pass is excluded so percentiles describe steady-state processing. Warmup PDF parsing took ${warmupParseMs.toFixed(3)} ms.`,
        "The model client is an in-process baseline stub that returns valid facts immediately. ai_extraction therefore excludes provider network time.",
        "Timing context stores byte size, page count, and text length only. Source text, filenames, storage keys, and excerpts are omitted.",
        "Use this baseline before optimizing extraction or comparison.",
      ],
    }),
  };
}

async function measureOnce(input: {
  repository: MemoryRepository;
  storage: DocumentStorage;
  projectId: string;
  pages: number;
  model: ConstructionFactsModelClient;
  timings: ProcessingRun;
}) {
  const document = await createDocument(ORGANIZATION_ID, input.projectId, { title: "Baseline plan" }, input.repository);
  const earlier = buildTextPdf(benchmarkPages("10", input.pages));
  const later = buildTextPdf(benchmarkPages("12", input.pages));
  const base = await ingestRevision(ORGANIZATION_ID, document.id, {
    revisionLabel: "A",
    originalFilename: "baseline-a.pdf",
    mimeType: "application/pdf",
    bytes: earlier,
  }, { repository: input.repository, storage: input.storage, timings: input.timings });
  await runConstructionFactsExtraction({
    organizationId: ORGANIZATION_ID,
    documentRevisionId: base.id,
    model: input.model,
    repository: input.repository,
    timings: input.timings,
  });
  const revised = await ingestRevision(ORGANIZATION_ID, document.id, {
    revisionLabel: "B",
    originalFilename: "baseline-b.pdf",
    mimeType: "application/pdf",
    bytes: later,
  }, { repository: input.repository, storage: input.storage, timings: input.timings });
  await runConstructionFactsExtraction({
    organizationId: ORGANIZATION_ID,
    documentRevisionId: revised.id,
    model: input.model,
    repository: input.repository,
    timings: input.timings,
  });
  await compareRevisionFacts({
    organizationId: ORGANIZATION_ID,
    baseRevisionId: base.id,
    revisedRevisionId: revised.id,
    repository: input.repository,
    timings: input.timings,
  });
  const review = await getProjectReview(ORGANIZATION_ID, input.projectId, input.repository, input.timings);
  listAttention(review.findings, input.timings);
  return {
    byteSize: earlier.length + later.length,
    pageCount: input.pages * 2,
    pageTextBytes: textBytes(base.pages) + textBytes(revised.pages),
  };
}

function benchmarkPages(amount: string, pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => (
    index === 0 ? `Excavation quantity is ${amount} CY.` : `Benchmark filler page ${index + 1}.`
  ));
}

function localModel(): ConstructionFactsModelClient {
  return {
    provider: "local",
    model: "baseline-stub",
    async extract(request) {
      const facts = request.pages.flatMap((page) => {
        const match = /(\d+)\s+CY/.exec(page.text);
        if (!match) return [];
        const excerpt = match[0];
        return [{
          type: "quantity" as const,
          subject: "excavation",
          amount: match[1] ?? "",
          unit: "CY",
          originalText: excerpt,
          modality: "asserted" as const,
          evidence: [{
            pageNumber: page.pageNumber,
            excerpt,
            startOffset: match.index,
            endOffset: match.index + excerpt.length,
          }],
        }];
      });
      return { extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version, facts };
    },
  };
}

function textBytes(pages: ReadonlyArray<{ text: string }>) {
  return pages.reduce((sum, page) => sum + Buffer.byteLength(page.text), 0);
}

function workloadLines(runs: readonly ProcessingRunTiming[], pages: number) {
  const byteSizes = runs.map((run) => run.context.byteSize).filter((value): value is number => typeof value === "number");
  const textBytes = runs.map((run) => run.context.pageTextBytes).filter((value): value is number => typeof value === "number");
  return [
    `${pages} pages per PDF, two revisions per run.`,
    `Combined PDF bytes per run: ${range(byteSizes)}.`,
    `Combined extracted text bytes per run: ${range(textBytes)}.`,
  ];
}

function range(values: number[]) {
  if (values.length === 0) return "n/a";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? String(min) : `${min}-${max}`;
}

export async function withBenchmarkStorage<T>(fn: (storage: DocumentStorage) => Promise<T>) {
  const root = await mkdtemp(path.join(tmpdir(), "construction-latency-"));
  try {
    const { LocalDocumentStorage } = await import("@/lib/documents/storage");
    return await fn(new LocalDocumentStorage(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
