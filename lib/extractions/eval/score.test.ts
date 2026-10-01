import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "../constructionFacts";
import {
  CONSTRUCTION_FACTS_FIXTURES,
  goldPrediction,
  type ConstructionFactsFixture,
} from "./fixtures";
import { f1, precision, recall, scoreConstructionFactsEval } from "./score";

const requiredFixtures = [
  "equipment-requirement",
  "schedule-date",
  "quantity-unit",
  "conditional-tentative-language",
  "historical-vs-current",
  "contradictory-language",
  "repeated-evidence-text",
  "unsupported-facts",
  "month-name-date",
  "ambiguous-numeric-date",
  "delete-replace-thickness",
  "ph-bounds",
  "equipment-list",
  "hedged-permission-keeps-dimension",
  "volume-and-tilling-depth",
  "fill-thickness",
  "tentative-temperature-window",
  "repeated-cubic-yards",
];

function fixture(id: string): ConstructionFactsFixture {
  const found = CONSTRUCTION_FACTS_FIXTURES.find((item) => item.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
}

function predictionsFrom(overrides: Record<string, unknown> = {}) {
  return Object.fromEntries(
    CONSTRUCTION_FACTS_FIXTURES.map((item) => [item.id, overrides[item.id] ?? goldPrediction(item)]),
  );
}

describe("construction-facts eval", () => {
  it("scores the labeled gold baseline as a perfect extraction", () => {
    expect(CONSTRUCTION_FACTS_FIXTURES.map((item) => item.id)).toEqual(requiredFixtures);

    const report = scoreConstructionFactsEval(CONSTRUCTION_FACTS_FIXTURES, predictionsFrom());

    expect(report.extractorVersion).toBe(CONSTRUCTION_FACTS_EXTRACTOR.version);
    expect(precision(report)).toBe(1);
    expect(recall(report)).toBe(1);
    expect(f1(report)).toBe(1);
    expect(report.fixtures.every((item) => item.malformed === false)).toBe(true);
    expect(report.truePositives).toBe(
      CONSTRUCTION_FACTS_FIXTURES.reduce((sum, item) => sum + item.expected.length, 0),
    );
  });

  it("keeps repeated evidence as one fact and rejects unsupported extractions", () => {
    const repeated = fixture("repeated-evidence-text");
    const excerpt = repeated.expected[0]?.evidence[0]?.excerpt ?? "";
    expect(repeated.pages[0]?.text.split(excerpt).length).toBe(3);
    expect(fixture("unsupported-facts").expected).toEqual([]);

    const duplicated = goldPrediction(repeated);
    const first = duplicated.facts[0];
    if (!first || first.type !== "quantity") throw new Error("Missing repeated quantity.");
    duplicated.facts.push({
      ...first,
      evidence: [{
        pageNumber: 1,
        excerpt,
        startOffset: repeated.pages[0]?.text.lastIndexOf(excerpt) ?? 0,
        endOffset: (repeated.pages[0]?.text.lastIndexOf(excerpt) ?? 0) + excerpt.length,
      }],
    });
    const unsupported = goldPrediction(fixture("unsupported-facts"));
    const question = "Does the site have room for a CAT 336 excavator?";
    const startOffset = fixture("unsupported-facts").pages[0]?.text.indexOf(question) ?? -1;
    unsupported.facts.push({
      type: "equipment_requirement",
      equipment: "CAT 336",
      statement: question,
      modality: "asserted",
      evidence: [{
        pageNumber: 1,
        excerpt: question,
        startOffset,
        endOffset: startOffset + question.length,
      }],
    });

    const report = scoreConstructionFactsEval(
      CONSTRUCTION_FACTS_FIXTURES,
      predictionsFrom({
        "repeated-evidence-text": duplicated,
        "unsupported-facts": unsupported,
      }),
    );
    const repeatedScore = report.fixtures.find((item) => item.id === "repeated-evidence-text");
    const unsupportedScore = report.fixtures.find((item) => item.id === "unsupported-facts");

    expect(repeatedScore).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 0 });
    expect(precision(repeatedScore!)).toBe(0.5);
    expect(recall(repeatedScore!)).toBe(1);
    expect(unsupportedScore).toMatchObject({ truePositives: 0, falsePositives: 1, falseNegatives: 0 });
    expect(precision(unsupportedScore!)).toBe(0);
    expect(recall(unsupportedScore!)).toBe(1);
  });

  it("drops recall for a missed fact, a contradiction side, and a modality swap", () => {
    const schedule = goldPrediction(fixture("schedule-date"));
    schedule.facts = [];

    const contradictory = goldPrediction(fixture("contradictory-language"));
    contradictory.facts = contradictory.facts.slice(0, 1);

    const historical = goldPrediction(fixture("historical-vs-current"));
    const current = historical.facts.find((fact) => fact.type === "schedule_date" && fact.modality === "asserted");
    if (!current || current.type !== "schedule_date") throw new Error("Missing current schedule fact.");
    current.modality = "historical";

    const report = scoreConstructionFactsEval(
      CONSTRUCTION_FACTS_FIXTURES,
      predictionsFrom({
        "schedule-date": schedule,
        "contradictory-language": contradictory,
        "historical-vs-current": historical,
      }),
    );

    expect(report.fixtures.find((item) => item.id === "schedule-date")).toMatchObject({
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 1,
    });
    expect(report.fixtures.find((item) => item.id === "contradictory-language")).toMatchObject({
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 1,
    });
    expect(report.fixtures.find((item) => item.id === "historical-vs-current")).toMatchObject({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
    });
    expect(recall(report)).toBeLessThan(1);
    expect(precision(report)).toBeLessThan(1);
  });

  it("counts output that fails construction-facts-v1 validation as a missed extraction", () => {
    const report = scoreConstructionFactsEval(
      [fixture("equipment-requirement")],
      { "equipment-requirement": { extractorVersion: "construction-facts-v2", facts: [] } },
    );

    expect(report.fixtures[0]).toMatchObject({
      malformed: true,
      truePositives: 0,
      falsePositives: 1,
      falseNegatives: 1,
    });
    expect(precision(report)).toBe(0);
    expect(recall(report)).toBe(0);
  });
});
