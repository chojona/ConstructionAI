import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { compareFacts, compareRevisionFacts, type ComparableFact } from "./compareFacts";

const trench = "A CAT 336 excavator shall be used for the trench.";

describe("compareFacts", () => {
  it("reports added, removed, and modified facts without treating a reorder as a change", () => {
    const before = [
      equipment("CAT 336", trench, [{ pageNumber: 1, excerpt: trench, startOffset: 0, endOffset: trench.length }]),
      schedule("work start", "2026-10-12", "Work shall begin on 2026-10-12.", [
        { pageNumber: 1, excerpt: "Work shall begin on 2026-10-12.", startOffset: 10, endOffset: 42 },
      ]),
      quantity("excavation", "20", "CY", "20 CY"),
      quantity("excavation", "10", "CY", "10 CY"),
    ];
    const after = [
      quantity("excavation", "10", "CY", "10 CY"),
      quantity("excavation", "15.5", "CY", "15.5 CY"),
      schedule("work start", "2026-10-14", "Work shall begin on 2026-10-14.", [
        { pageNumber: 2, excerpt: "Work shall begin on 2026-10-14.", startOffset: 4, endOffset: 36 },
      ]),
      equipment("dewatering pump", "A dewatering pump shall be provided.", [
        { pageNumber: 2, excerpt: "A dewatering pump shall be provided.", startOffset: 0, endOffset: 37 },
      ]),
    ];

    const changes = compareFacts(before, after);

    expect(changes).toEqual([
      expect.objectContaining({
        changeType: "REMOVED",
        category: "equipment_requirement",
        material: true,
        basis: "identity",
        before: expect.objectContaining({ payload: expect.objectContaining({ equipment: "CAT 336" }) }),
        after: null,
      }),
      expect.objectContaining({
        changeType: "ADDED",
        category: "equipment_requirement",
        material: true,
        basis: "identity",
        before: null,
        after: expect.objectContaining({
          evidence: [{ pageNumber: 2, excerpt: "A dewatering pump shall be provided.", startOffset: 0, endOffset: 37 }],
        }),
      }),
      expect.objectContaining({
        changeType: "MODIFIED",
        category: "schedule_date",
        material: true,
        basis: "date",
        before: expect.objectContaining({
          evidence: [{ pageNumber: 1, excerpt: "Work shall begin on 2026-10-12.", startOffset: 10, endOffset: 42 }],
        }),
        after: expect.objectContaining({
          payload: expect.objectContaining({ date: "2026-10-14" }),
          evidence: [{ pageNumber: 2, excerpt: "Work shall begin on 2026-10-14.", startOffset: 4, endOffset: 36 }],
        }),
      }),
      expect.objectContaining({
        changeType: "MODIFIED",
        category: "quantity",
        material: true,
        basis: "numeric",
        before: expect.objectContaining({ payload: expect.objectContaining({ amount: "20" }) }),
        after: expect.objectContaining({ payload: expect.objectContaining({ amount: "15.5" }) }),
      }),
    ]);
    expect(JSON.stringify(changes)).not.toMatch(/conflict|hcss/i);
  });

  it("treats equivalent numbers, units, dates, and wording as non-material", () => {
    const before = [
      equipment("CAT 336", "A CAT 336 excavator shall be used.", [
        { pageNumber: 1, excerpt: "old citation", startOffset: 0, endOffset: 12 },
      ]),
      schedule("Work Start", "2026-10-12", "October 12, 2026", [
        { pageNumber: 1, excerpt: "October 12, 2026", startOffset: 0, endOffset: 16 },
      ]),
      quantity("Excavation", "1250.00", "cy", "1,250 CY"),
    ];
    const after = [
      equipment("cat-336", "A CAT 336 excavator shall be used", [
        { pageNumber: 3, excerpt: "new citation", startOffset: 8, endOffset: 20 },
      ]),
      schedule("work start", "2026-10-12", "Oct 12, 2026", [
        { pageNumber: 2, excerpt: "Oct 12, 2026", startOffset: 1, endOffset: 13 },
      ]),
      quantity("excavation", "1250", "CY", "1250 cubic yards"),
    ];

    const changes = compareFacts(before, after);

    expect(changes.filter((change) => change.material)).toEqual([]);
    expect(changes).toEqual([
      expect.objectContaining({
        changeType: "MODIFIED",
        category: "schedule_date",
        material: false,
        basis: "wording",
        before: expect.objectContaining({ evidence: before[1]!.evidence }),
        after: expect.objectContaining({ evidence: after[1]!.evidence }),
      }),
      expect.objectContaining({
        changeType: "MODIFIED",
        category: "quantity",
        material: false,
        basis: "wording",
      }),
    ]);
  });

  it("treats a modality or unit change as a material modification", () => {
    const changes = compareFacts(
      [
        equipment("tower crane", "A tower crane shall be used.", [], "asserted"),
        quantity("concrete", "40", "CY", "40 CY"),
      ],
      [
        equipment("tower crane", "A tower crane might be used.", [], "tentative"),
        quantity("concrete", "40", "m3", "40 m3"),
      ],
    );

    expect(changes).toEqual([
      expect.objectContaining({ category: "equipment_requirement", material: true, basis: "modality" }),
      expect.objectContaining({ category: "quantity", material: true, basis: "unit" }),
    ]);
  });

  it("keeps unit aliases, equivalent calendar dates, and nearest repeated amounts from crossing", () => {
    const changes = compareFacts(
      [
        quantity("trench excavation", "3165", "C.Y.", "3,165 C.Y."),
        quantity("scarification depth", "6", "inches", "6 inches"),
        schedule("civil drawings", "2025-06-06", "June 6, 2025", [
          { pageNumber: 1, excerpt: "June 6, 2025", startOffset: 0, endOffset: 12 },
        ]),
        quantity("excavation", "10", "CY", "10 CY"),
        quantity("excavation", "20", "CY", "20 CY"),
        quantity("compost", "4", "yards", "4 cubic yards"),
        quantity("compost", "6", "yards", "6 cubic yards"),
      ],
      [
        quantity("trench excavation", "3165", "cubic yards", "3,165 cubic yards"),
        quantity("scarification depth", "6", "inch", "6 inch"),
        schedule("civil drawings", null, "6 June 2025", [
          { pageNumber: 2, excerpt: "6 June 2025", startOffset: 0, endOffset: 11 },
        ]),
        quantity("excavation", "21", "CY", "21 CY"),
        quantity("excavation", "11", "CY", "11 CY"),
        quantity("compost", "6", "cubic yards", "6 cubic yards"),
        quantity("compost", "4", "cubic yards", "4 cubic yards"),
      ],
    );

    expect(changes.filter((change) => change.material)).toEqual([
      expect.objectContaining({
        category: "quantity",
        basis: "numeric",
        before: expect.objectContaining({
          payload: expect.objectContaining({ amount: "10" }),
          evidence: [expect.objectContaining({ excerpt: "10 CY" })],
        }),
        after: expect.objectContaining({
          payload: expect.objectContaining({ amount: "11" }),
          evidence: [expect.objectContaining({ excerpt: "11 CY" })],
        }),
      }),
      expect.objectContaining({
        category: "quantity",
        basis: "numeric",
        before: expect.objectContaining({
          payload: expect.objectContaining({ amount: "20" }),
          evidence: [expect.objectContaining({ excerpt: "20 CY" })],
        }),
        after: expect.objectContaining({
          payload: expect.objectContaining({ amount: "21" }),
          evidence: [expect.objectContaining({ excerpt: "21 CY" })],
        }),
      }),
    ]);
    expect(changes.filter((change) => !change.material).every((change) => change.basis === "wording")).toBe(true);
    expect(changes.some((change) => change.basis === "unit" || change.basis === "date")).toBe(false);
  });

  it("treats an unparsed date-text change as a material date change", () => {
    const changes = compareFacts(
      [schedule("notice to proceed", null, "mid October", [])],
      [schedule("notice to proceed", null, "mid November", [])],
    );

    expect(changes).toEqual([
      expect.objectContaining({ changeType: "MODIFIED", material: true, basis: "date" }),
    ]);
  });
});

describe("compareRevisionFacts", () => {
  it("compares the latest succeeded construction-facts runs on two revisions of one document", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
    const document = await repository.createDocument({
      organizationId: "org_a",
      projectId: project.id,
      title: "Drainage Plan",
    });
    const base = await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      sha256: "a".repeat(64),
      storageKey: "revisions/a.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: trench, textSha256: "c".repeat(64) }],
    });
    const revised = await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "B",
      originalFilename: "b.pdf",
      mimeType: "application/pdf",
      byteSize: 11,
      sha256: "b".repeat(64),
      storageKey: "revisions/b.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: "A dozer shall be used.", textSha256: "d".repeat(64) }],
    });
    await succeededFacts(repository, base.id, [equipment("CAT 336", trench, [
      { pageNumber: 1, excerpt: trench, startOffset: 0, endOffset: trench.length, documentPageId: base.pages[0]!.id },
    ])]);
    const stale = await succeededFacts(repository, revised.id, [equipment("CAT 336", trench, [
      { pageNumber: 1, excerpt: trench, startOffset: 0, endOffset: trench.length, documentPageId: revised.pages[0]!.id },
    ])]);
    await repository.applyExtractionRunTransition({
      organizationId: "org_a",
      extractionRunId: stale.id,
      expectedStatus: "SUCCEEDED",
      status: "SUPERSEDED",
    });
    const latest = await succeededFacts(repository, revised.id, [equipment("dozer", "A dozer shall be used.", [
      { pageNumber: 1, excerpt: "A dozer shall be used.", startOffset: 0, endOffset: 22, documentPageId: revised.pages[0]!.id },
    ])]);

    const result = await compareRevisionFacts({
      organizationId: "org_a",
      baseRevisionId: base.id,
      revisedRevisionId: revised.id,
      repository,
    });

    expect(result.baseRunId).not.toBe(latest.id);
    expect(result.revisedRunId).toBe(latest.id);
    expect(result.changes.map((change) => change.changeType)).toEqual(["REMOVED", "ADDED"]);
    expect(await repository.getProject("org_a", project.id)).toMatchObject({ name: "I-95 Bridge" });
  });

  it("rejects revisions that are not comparable", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
    const first = await repository.createDocument({
      organizationId: "org_a",
      projectId: project.id,
      title: "Drainage Plan",
    });
    const second = await repository.createDocument({
      organizationId: "org_a",
      projectId: project.id,
      title: "Paving Plan",
    });
    const base = await repository.createRevision({
      documentId: first!.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      sha256: "a".repeat(64),
      storageKey: "revisions/a.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: trench, textSha256: "c".repeat(64) }],
    });
    const otherDocument = await repository.createRevision({
      documentId: second!.id,
      revisionLabel: "A",
      originalFilename: "b.pdf",
      mimeType: "application/pdf",
      byteSize: 11,
      sha256: "b".repeat(64),
      storageKey: "revisions/b.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: trench, textSha256: "d".repeat(64) }],
    });

    await expect(compareRevisionFacts({
      organizationId: "org_a",
      baseRevisionId: base.id,
      revisedRevisionId: otherDocument.id,
      repository,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(compareRevisionFacts({
      organizationId: "org_a",
      baseRevisionId: base.id,
      revisedRevisionId: "missing",
      repository,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(compareRevisionFacts({
      organizationId: "org_a",
      baseRevisionId: base.id,
      revisedRevisionId: base.id,
      repository,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

function equipment(
  name: string,
  statement: string,
  evidence: ComparableFact["evidence"],
  modality = "asserted",
): ComparableFact {
  return {
    factType: "equipment_requirement",
    payload: { equipment: name, statement, modality },
    evidence,
  };
}

function schedule(
  event: string,
  date: string | null,
  dateText: string,
  evidence: ComparableFact["evidence"],
): ComparableFact {
  return {
    factType: "schedule_date",
    payload: { event, date, dateText, modality: "asserted" },
    evidence,
  };
}

function quantity(subject: string, amount: string, unit: string, originalText: string): ComparableFact {
  return {
    factType: "quantity",
    payload: { subject, amount, unit, originalText, modality: "asserted" },
    evidence: [{ pageNumber: 1, excerpt: originalText, startOffset: 0, endOffset: originalText.length }],
  };
}

async function succeededFacts(
  repository: MemoryRepository,
  documentRevisionId: string,
  facts: ComparableFact[],
) {
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  if (!queued) throw new Error("Missing extraction run");
  await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
  });
  const committed = await repository.commitProposedFacts({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "RUNNING",
    completedAt: new Date("2026-09-30T18:00:00.000Z"),
    facts: facts.map((fact) => ({
      factType: fact.factType,
      payload: fact.payload,
      evidence: fact.evidence.map((item) => ({
        documentPageId: item.documentPageId ?? "",
        pageNumber: item.pageNumber,
        excerpt: item.excerpt,
        startOffset: item.startOffset,
        endOffset: item.endOffset,
      })),
    })),
  });
  if (!committed) throw new Error("Facts were not recorded");
  return committed;
}
