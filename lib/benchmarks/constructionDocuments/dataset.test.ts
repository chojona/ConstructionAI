import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { goldBaselinePredictions, precision, recall } from "@/lib/extractions/eval/score";
import { CONSTRUCTION_DOCUMENT_BENCHMARK } from "./dataset";
import {
  constructionDocumentFixtures,
  evaluateConstructionDocumentBenchmark,
  labeledChanges,
} from "./evaluate";

const requiredPhenomena = [
  "table",
  "repeated-text",
  "date-format",
  "units",
  "contradictory",
  "conditional",
  "addition",
  "removal",
  "wording-only",
] as const;

describe("construction document benchmark", () => {
  it("ships at least 10 sourced revision pairs and the required document phenomena", () => {
    expect(CONSTRUCTION_DOCUMENT_BENCHMARK.pairs.length).toBeGreaterThanOrEqual(10);
    expect(CONSTRUCTION_DOCUMENT_BENCHMARK.pairs.length).toBeLessThanOrEqual(30);
    const phenomena = new Set(CONSTRUCTION_DOCUMENT_BENCHMARK.pairs.flatMap((pair) => pair.phenomena));
    for (const phenomenon of requiredPhenomena) expect(phenomena.has(phenomenon)).toBe(true);
    for (const pair of CONSTRUCTION_DOCUMENT_BENCHMARK.pairs) {
      expect(pair.source.retrievedOn).toBe("2026-09-30");
      expect(pair.source.url).toMatch(/^https:\/\//);
      expect(pair.source.sanitization.length).toBeGreaterThan(0);
      expect(pair.source.rights).toBe("public-agency-record");
      expect(pair.labeling).toBe("human");
    }
  });

  it("scores human labels as a perfect extraction and matches the labeled revision changes", () => {
    const report = evaluateConstructionDocumentBenchmark(CONSTRUCTION_DOCUMENT_BENCHMARK);
    expect(report.extractionMismatches).toEqual([]);
    expect(precision(report.extraction)).toBe(1);
    expect(recall(report.extraction)).toBe(1);
    expect(report.changeMismatches).toEqual([]);
  });

  it("keeps deleted, fractional, percent, and May-date spans out of the labeled facts", () => {
    const thickness = pair("sudas-topsoil-thickness");
    expect(thickness.revised.expected).toEqual([
      expect.objectContaining({ type: "quantity", amount: "4", originalText: "4 inch" }),
    ]);
    expect(thickness.revised.notFacts.map((item) => item.excerpt)).toContain("8 inch");

    const trench = pair("ct-trench-excavation");
    expect(trench.base.pages[0]?.text.match(/3,165 C\.Y\./g)).toHaveLength(2);
    const flyAsh = pair("council-bluffs-fly-ash");
    expect(flyAsh.revised.pages[0]?.text.match(/40° F/g)).toHaveLength(2);

    const drawings = pair("catawba-drawing-dates");
    const ambiguous = drawings.revised.expected.find((fact) => fact.type === "schedule_date" && fact.dateText === "08-05-2025");
    expect(ambiguous).toMatchObject({ date: null });
    expect(drawings.revised.notFacts.map((item) => item.excerpt)).toContain("May 2025");

    const table = pair("sudas-offsite-topsoil");
    const labeledText = JSON.stringify(table.base.expected);
    expect(labeledText).not.toMatch(/0\.125|1\/2|3%/);
    expect(table.base.notFacts.some((item) => item.excerpt.includes("3%"))).toBe(true);
  });

  it("does not treat the human labels as a model prediction file", () => {
    const fixtures = constructionDocumentFixtures(CONSTRUCTION_DOCUMENT_BENCHMARK);
    const gold = goldBaselinePredictions(fixtures);
    const checkDam = "catawba-check-dam:revised";
    const prediction = gold[checkDam] as { facts: unknown[] };
    const report = evaluateConstructionDocumentBenchmark(CONSTRUCTION_DOCUMENT_BENCHMARK, {
      ...gold,
      [checkDam]: {
        extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
        facts: prediction.facts.slice(0, -1),
      },
    });
    expect(recall(report.extraction)).toBeLessThan(1);
    expect(report.extractionMismatches.map((item) => item.id)).toContain(checkDam);
  });

  it("labels wording-only edits as no material fact change and keeps both compost amounts", () => {
    const wording = pair("thornton-structure-measurement");
    expect(wording.expectedChanges).toEqual([]);
    expect(labeledChanges(wording)).toEqual([]);

    const compost = pair("thornton-compost");
    const amounts = compost.revised.expected
      .filter((fact) => fact.type === "quantity" && fact.subject === "compost")
      .map((fact) => fact.type === "quantity" ? fact.amount : "");
    expect(amounts).toEqual(["4", "6"]);
    const added = compost.expectedChanges.filter((change) => change.slot === "quantity:compost");
    expect(added).toHaveLength(2);
    expect(added.every((change) => change.changeType === "ADDED" && change.material)).toBe(true);
  });
});

function pair(id: string) {
  const found = CONSTRUCTION_DOCUMENT_BENCHMARK.pairs.find((item) => item.id === id);
  if (!found) throw new Error(`Missing benchmark pair ${id}`);
  return found;
}
