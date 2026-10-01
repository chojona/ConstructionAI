import { describe, expect, it } from "vitest";
import type { CommitProposedFactsInput } from "@/lib/domain/repository";
import { PipelineTimeoutError, startProcessingRun } from "@/lib/observability/pipelineTiming";
import { getProjectReview, recordReviewDecision } from "@/lib/review/service";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import {
  CONSTRUCTION_FACTS_EXTRACTOR,
  conflictingAssertedLanguage,
  parseConstructionFactsV1,
  runConstructionFactsExtraction,
  type ConstructionFactsModelClient,
} from "./constructionFacts";
import { listProposedFacts } from "./proposedFacts";

const pageText = [
  "A CAT 336 excavator shall be used for the trench.",
  "A CAT 336 may be required if rock is encountered.",
  "Contractor requested an Oct 10 start.",
  "Work shall begin on 2026-10-12.",
  "Excavation quantity is 1,250 CY.",
  "Unit price is $42.50/CY.",
  "The previous plan required a CAT 320.",
].join("\n");

const pages = [{ pageNumber: 1, text: pageText }];

function evidence(excerpt: string, pageNumber = 1) {
  const page = pages.find((item) => item.pageNumber === pageNumber);
  const startOffset = page?.text.indexOf(excerpt) ?? -1;
  if (startOffset < 0) throw new Error(`Missing excerpt: ${excerpt}`);
  return { pageNumber, excerpt, startOffset, endOffset: startOffset + excerpt.length };
}

function output(facts: unknown[]) {
  return { extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version, facts };
}

describe("construction-facts-v1", () => {
  it("accepts the three v1 fact types with exact evidence and an explicit extractor version", () => {
    const parsed = parseConstructionFactsV1(output([
      {
        type: "equipment_requirement",
        equipment: "CAT 336",
        statement: "A CAT 336 excavator shall be used for the trench.",
        modality: "asserted",
        evidence: [evidence("A CAT 336 excavator shall be used for the trench.")],
      },
      {
        type: "schedule_date",
        event: "work start",
        date: "2026-10-12",
        dateText: "Work shall begin on 2026-10-12.",
        modality: "asserted",
        evidence: [evidence("Work shall begin on 2026-10-12.")],
      },
      {
        type: "quantity",
        subject: "excavation",
        amount: "1250",
        unit: "CY",
        originalText: "1,250 CY",
        modality: "asserted",
        evidence: [evidence("Excavation quantity is 1,250 CY.")],
      },
    ]), pages);

    expect(CONSTRUCTION_FACTS_EXTRACTOR).toEqual({
      name: "construction-facts",
      version: "construction-facts-v1",
    });
    expect(parsed).toMatchObject([
      { type: "equipment_requirement", equipment: "CAT 336", modality: "asserted" },
      { type: "schedule_date", date: "2026-10-12", modality: "asserted" },
      { type: "quantity", amount: "1250", unit: "CY", originalText: "1,250 CY" },
    ]);
    expect(parsed[2]).not.toHaveProperty("value");
  });

  it("keeps tentative, conditional, historical, and proposed language from becoming asserted facts", () => {
    const parsed = parseConstructionFactsV1(output([
      {
        type: "equipment_requirement",
        equipment: "CAT 336",
        statement: "A CAT 336 may be required if rock is encountered.",
        modality: "tentative",
        evidence: [evidence("A CAT 336 may be required if rock is encountered.")],
      },
      {
        type: "schedule_date",
        event: "requested start",
        date: null,
        dateText: "Contractor requested an Oct 10 start.",
        modality: "proposed",
        evidence: [evidence("Contractor requested an Oct 10 start.")],
      },
      {
        type: "equipment_requirement",
        equipment: "CAT 320",
        statement: "The previous plan required a CAT 320.",
        modality: "historical",
        evidence: [evidence("The previous plan required a CAT 320.")],
      },
    ]), pages);

    expect(parsed.map((fact) => fact.modality)).toEqual(["tentative", "proposed", "historical"]);
  });

  it("rejects asserted facts whose source language is tentative, conditional, or historical", () => {
    const tentative = output([{
      type: "equipment_requirement",
      equipment: "CAT 336",
      statement: "A CAT 336 may be required if rock is encountered.",
      modality: "asserted",
      evidence: [evidence("A CAT 336 may be required if rock is encountered.")],
    }]);
    const requested = output([{
      type: "schedule_date",
      event: "work start",
      date: "2026-10-10",
      dateText: "Contractor requested an Oct 10 start.",
      modality: "asserted",
      evidence: [evidence("Contractor requested an Oct 10 start.")],
    }]);
    const historical = output([{
      type: "equipment_requirement",
      equipment: "CAT 320",
      statement: "The previous plan required a CAT 320.",
      modality: "asserted",
      evidence: [evidence("The previous plan required a CAT 320.")],
    }]);

    expect(() => parseConstructionFactsV1(tentative, pages)).toThrow(/tentative|conditional|historical/i);
    expect(() => parseConstructionFactsV1(requested, pages)).toThrow(/tentative|conditional|historical/i);
    expect(() => parseConstructionFactsV1(historical, pages)).toThrow(/tentative|conditional|historical/i);
  });

  it("accepts an asserted schedule date written as the month name May plus a year", () => {
    const text = "Bidding and Contract Documents dated May 2025.";
    const excerpt = "May 2025";
    const startOffset = text.indexOf(excerpt);
    const localPages = [{ pageNumber: 1, text }];
    const parsed = parseConstructionFactsV1(output([{
      type: "schedule_date",
      event: "bidding documents",
      date: null,
      dateText: excerpt,
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt, startOffset, endOffset: startOffset + excerpt.length }],
    }]), localPages);

    expect(parsed[0]).toMatchObject({ type: "schedule_date", dateText: "May 2025", modality: "asserted" });
    expect(conflictingAssertedLanguage("dated May 2025")).toBeNull();
    expect(conflictingAssertedLanguage("15 May 2025")).toBeNull();
    expect(conflictingAssertedLanguage("May 15, 2025")).toBeNull();
    expect(conflictingAssertedLanguage("A CAT 336 may be required.")).toBe("tentative");
    expect(conflictingAssertedLanguage("Section 15 may be required.")).toBe("tentative");
    expect(conflictingAssertedLanguage("temperatures may fall below 40")).toBe("tentative");
  });

  it("keeps quantity scale and unit instead of accepting a float", () => {
    const parsed = parseConstructionFactsV1(output([{
      type: "quantity",
      subject: "excavation unit price",
      amount: "42.50",
      unit: "USD/CY",
      originalText: "$42.50/CY",
      modality: "asserted",
      evidence: [evidence("Unit price is $42.50/CY.")],
    }]), pages);

    expect(parsed[0]).toMatchObject({ amount: "42.50", unit: "USD/CY" });
    expect(typeof (parsed[0] as { amount: string }).amount).toBe("string");

    expect(() => parseConstructionFactsV1(output([{
      type: "quantity",
      subject: "excavation",
      amount: 1250,
      unit: "CY",
      originalText: "1,250 CY",
      modality: "asserted",
      evidence: [evidence("Excavation quantity is 1,250 CY.")],
    }]), pages)).toThrow();
    expect(() => parseConstructionFactsV1(output([{
      type: "quantity",
      subject: "excavation",
      amount: "1,250",
      unit: "CY",
      originalText: "1,250 CY",
      modality: "asserted",
      evidence: [evidence("Excavation quantity is 1,250 CY.")],
    }]), pages)).toThrow();
    expect(() => parseConstructionFactsV1(output([{
      type: "quantity",
      subject: "excavation",
      amount: "1250",
      unit: "",
      originalText: "1,250 CY",
      modality: "asserted",
      evidence: [evidence("Excavation quantity is 1,250 CY.")],
    }]), pages)).toThrow();
  });

  it("rejects malformed output, unknown fact types, and evidence that is not on the page", () => {
    expect(() => parseConstructionFactsV1({ facts: [] }, pages)).toThrow();
    expect(() => parseConstructionFactsV1({
      extractorVersion: "construction-facts-v2",
      facts: [],
    }, pages)).toThrow();
    expect(() => parseConstructionFactsV1(output([{
      type: "conflict",
      modality: "asserted",
      evidence: [evidence("A CAT 336 excavator shall be used for the trench.")],
    }]), pages)).toThrow();
    expect(() => parseConstructionFactsV1(output([{
      type: "schedule_date",
      event: "work start",
      date: "2026-13-40",
      dateText: "Work shall begin on 2026-10-12.",
      modality: "asserted",
      evidence: [evidence("Work shall begin on 2026-10-12.")],
    }]), pages)).toThrow();

    const excerpt = "A CAT 336 excavator shall be used for the trench.";
    const located = evidence(excerpt);
    expect(() => parseConstructionFactsV1(output([{
      type: "equipment_requirement",
      equipment: "CAT 336",
      statement: excerpt,
      modality: "asserted",
      evidence: [{ ...located, excerpt: "A CAT 320 excavator shall be used for the trench." }],
    }]), pages)).toThrow();
    expect(() => parseConstructionFactsV1(output([{
      type: "equipment_requirement",
      equipment: "CAT 336",
      statement: excerpt,
      modality: "asserted",
      evidence: [{ ...located, pageNumber: 4 }],
    }]), pages)).toThrow();
    expect(() => parseConstructionFactsV1(output([{
      type: "equipment_requirement",
      equipment: "CAT 336",
      statement: excerpt,
      modality: "asserted",
      evidence: [{ ...located, startOffset: located.startOffset + 1 }],
    }]), pages)).toThrow();
  });
});

const clock = () => new Date("2026-09-30T18:00:00.000Z");

function model(extract: ConstructionFactsModelClient["extract"]): ConstructionFactsModelClient {
  return { provider: "openai", model: "gpt-4.1", extract };
}

async function processedRevision(repository: MemoryRepository) {
  const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
  const document = await repository.createDocument({
    organizationId: "org_a",
    projectId: project.id,
    title: "Drainage Plan",
  });
  return repository.createRevision({
    documentId: document!.id,
    revisionLabel: "Revision A",
    originalFilename: "drainage.pdf",
    mimeType: "application/pdf",
    byteSize: 1200,
    sha256: "a".repeat(64),
    storageKey: "revisions/drainage.pdf",
    status: "PROCESSED",
    pages: [{ pageNumber: 1, text: pageText, textSha256: "b".repeat(64) }],
  });
}

describe("construction facts extraction run", () => {
  it("records a versioned run and returns proposed facts without changing project truth", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const beforeRevision = structuredClone(await repository.getRevision("org_a", revision.id));
    const beforeProject = structuredClone(await repository.getProject("org_a", revision.document.project.id));
    const excerpt = "Excavation quantity is 1,250 CY.";

    const result = await runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async (request) => {
        expect(request).toMatchObject({
          extractorName: "construction-facts",
          extractorVersion: "construction-facts-v1",
        });
        expect(request.pages).toEqual([{ pageNumber: 1, text: pageText }]);
        return output([{
          type: "quantity",
          subject: "excavation",
          amount: "1250",
          unit: "CY",
          originalText: "1,250 CY",
          modality: "asserted",
          evidence: [evidence(excerpt)],
        }]);
      }),
      repository,
      clock,
    });

    expect(result.run).toMatchObject({
      extractorName: "construction-facts",
      extractorVersion: "construction-facts-v1",
      provider: "openai",
      model: "gpt-4.1",
      status: "SUCCEEDED",
      failureCode: null,
      completedAt: clock(),
    });
    expect(result.proposedFacts).toMatchObject([{ type: "quantity", amount: "1250", unit: "CY" }]);
    expect(await listProposedFacts("org_a", result.run.id, repository)).toMatchObject([{
      extractionRunId: result.run.id,
      factType: "quantity",
      payload: { amount: "1250", unit: "CY", modality: "asserted" },
      evidence: [{ pageNumber: 1, excerpt, documentPageId: revision.pages[0]?.id }],
    }]);
    expect(await repository.getRevision("org_a", revision.id)).toEqual(beforeRevision);
    expect(await repository.getProject("org_a", revision.document.project.id)).toEqual(beforeProject);
    expect(repository.projects.some((project) => "equipment" in project)).toBe(false);
  });

  it("fails the run when model output is malformed and does not keep the facts", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);

    await expect(runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => ({ extractorVersion: "construction-facts-v1", facts: [{ type: "person" }] })),
      repository,
      clock,
    })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT" });

    expect(repository.extractionRuns).toMatchObject([{
      status: "FAILED",
      failureCode: "MALFORMED_OUTPUT",
      extractorVersion: "construction-facts-v1",
    }]);
    expect(repository.proposedFacts).toHaveLength(0);
    expect(await repository.getRevision("org_a", revision.id)).toMatchObject({ status: "PROCESSED" });
  });

  it("fails the run when the model provider errors", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);

    await expect(runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => {
        throw new Error("timeout");
      }),
      repository,
      clock,
    })).rejects.toMatchObject({ code: "PROVIDER_ERROR" });

    expect(repository.extractionRuns[0]).toMatchObject({
      status: "FAILED",
      failureCode: "PROVIDER_ERROR",
    });
  });

  it("does not analyze another organization's revision", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    repository.addOrganization("org_b");
    const revision = await processedRevision(repository);

    await expect(runConstructionFactsExtraction({
      organizationId: "org_b",
      documentRevisionId: revision.id,
      model: model(async () => output([])),
      repository,
      clock,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.extractionRuns).toHaveLength(0);
  });

  it("records a timeout separately from a slow successful extraction", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    let now = 0;
    const slow = startProcessingRun({ kind: "extraction", now: () => now });
    const result = await runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => {
        now += 750;
        return output([]);
      }),
      repository,
      clock,
      timings: slow,
    });
    expect(result.run.status).toBe("SUCCEEDED");
    expect(slow.finish()).toMatchObject({
      outcome: "success",
      stages: [
        { stage: "ai_extraction", outcome: "success", durationMs: 750 },
        { stage: "structured_output_validation", outcome: "success" },
        { stage: "proposed_fact_persistence", outcome: "success" },
      ],
    });
    expect(JSON.stringify(slow.finish())).not.toContain("CAT 336");

    const timings = startProcessingRun({ kind: "extraction" });
    await expect(runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => {
        throw new PipelineTimeoutError();
      }),
      repository,
      clock,
      timings,
    })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(timings.finish()).toMatchObject({
      outcome: "timeout",
      stages: [{ stage: "ai_extraction", outcome: "timeout", context: { failureCode: "TIMEOUT" } }],
    });
    expect(repository.extractionRuns.at(-1)).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT" });
    expect(JSON.stringify(timings.finish())).not.toContain("CAT 336");
  });

  it("drops partial facts from a failed attempt and leaves earlier evidence immutable after retry", async () => {
    const repository = new PartialWriteRepository();
    repository.addOrganization("org_a");
    const revision = await processedRevision(repository);
    const projectId = revision.document.project.id;
    const excerpt = "Excavation quantity is 1,250 CY.";
    const succeeded = await runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => output([{
        type: "quantity",
        subject: "excavation",
        amount: "1250",
        unit: "CY",
        originalText: "1,250 CY",
        modality: "asserted",
        evidence: [evidence(excerpt)],
      }])),
      repository,
      clock,
    });
    const historicalFacts = structuredClone(await listProposedFacts("org_a", succeeded.run.id, repository));
    const historicalRun = structuredClone(succeeded.run);
    const historicalRevision = structuredClone(await repository.getRevision("org_a", revision.id));
    await recordReviewDecision("org_a", projectId, "pm-1", {
      decision: "ACCEPTED",
      reason: "Matches the quantity takeoff.",
      subject: { type: "proposed_fact", proposedFactId: historicalFacts[0]!.id },
    }, repository, clock);
    const acceptedState = await getProjectReview("org_a", projectId, repository);
    repository.failNextCommit = true;

    await expect(runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => output([])),
      repository,
      clock,
    })).rejects.toMatchObject({ code: "PROVIDER_ERROR" });

    expect(repository.extractionRuns.map((run) => [run.attemptNumber, run.status, run.failureCode])).toEqual([
      [1, "SUCCEEDED", null],
      [2, "FAILED", "PROVIDER_ERROR"],
    ]);
    expect(repository.proposedFacts.map((fact) => fact.extractionRunId)).toEqual([succeeded.run.id]);
    expect(await listProposedFacts("org_a", succeeded.run.id, repository)).toEqual(historicalFacts);
    expect(repository.extractionRuns[0]).toEqual(historicalRun);
    expect(await repository.getRevision("org_a", revision.id)).toEqual(historicalRevision);
    expect((await getProjectReview("org_a", projectId, repository)).state).toEqual(acceptedState.state);

    const retried = await runConstructionFactsExtraction({
      organizationId: "org_a",
      documentRevisionId: revision.id,
      model: model(async () => output([{
        type: "quantity",
        subject: "backfill",
        amount: "1250",
        unit: "CY",
        originalText: "1,250 CY",
        modality: "asserted",
        evidence: [evidence(excerpt)],
      }])),
      repository,
      clock,
    });
    expect(retried.run).toMatchObject({ attemptNumber: 3, status: "SUCCEEDED", failureCode: null });
    expect(await listProposedFacts("org_a", succeeded.run.id, repository)).toEqual(historicalFacts);
    expect(repository.extractionRuns[0]).toEqual(historicalRun);
    expect(repository.extractionRuns[1]).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_ERROR" });
    expect((await getProjectReview("org_a", projectId, repository)).state.facts.map((fact) => fact.proposedFactId)).toEqual(
      acceptedState.state.facts.map((fact) => fact.proposedFactId),
    );
  });
});

class PartialWriteRepository extends MemoryRepository {
  failNextCommit = false;

  override async commitProposedFacts(input: CommitProposedFactsInput) {
    if (!this.failNextCommit) return super.commitProposedFacts(input);
    this.failNextCommit = false;
    this.proposedFacts.push({
      id: "partial_fact",
      extractionRunId: input.extractionRunId,
      ordinal: 0,
      factType: "quantity",
      payload: { subject: "excavation", amount: "9", unit: "CY", originalText: "9 CY", modality: "asserted" },
      evidence: [],
      createdAt: new Date("2026-09-30T18:00:00.000Z"),
    });
    throw new Error("write failed after the first fact");
  }
}
