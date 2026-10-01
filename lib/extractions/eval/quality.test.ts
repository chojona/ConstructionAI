import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "../constructionFacts";
import { CONSTRUCTION_FACTS_FIXTURES, goldPrediction, locateExcerpt, type ConstructionFactsFixture } from "./fixtures";
import { goldBaselinePredictions, precision, scoreConstructionFactsEval } from "./score";
import { scoreExtractionQuality } from "./quality";

const model = { provider: "test", model: "scorer" };

function fixture(id: string): ConstructionFactsFixture {
  const found = CONSTRUCTION_FACTS_FIXTURES.find((item) => item.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
}

describe("extraction quality report", () => {
  it("scores supplied gold predictions as meeting every measured goal", () => {
    const report = scoreExtractionQuality(
      CONSTRUCTION_FACTS_FIXTURES,
      goldBaselinePredictions(CONSTRUCTION_FACTS_FIXTURES),
      model,
    );

    expect(report.predictionSource).toBe("model");
    expect(report.overall.precision).toBe(1);
    expect(report.overall.recall).toBe(1);
    expect(report.overall.evidenceCorrectness).toBe(1);
    expect(report.overall.hallucinatedFactRate).toBe(0);
    expect(report.overall.modalityCorrectness).toBe(1);
    expect(report.overall.normalizationCorrectness).toBe(1);
    expect(report.overall.unsupportedHighConfidenceFacts).toBe(0);
    expect(report.targets.allMeasuredTargetsMet).toBe(true);
    expect(report.misses).toEqual([]);
    expect(report.overall.truePositives).toBe(
      scoreConstructionFactsEval(CONSTRUCTION_FACTS_FIXTURES, goldBaselinePredictions(CONSTRUCTION_FACTS_FIXTURES)).truePositives,
    );
  });

  it("classifies evidence, normalization, modality, schema, and parsing misses", () => {
    const equipment = fixture("equipment-requirement");
    const quantity = fixture("quantity-unit");
    const schedule = fixture("schedule-date");
    const equipmentGold = goldPrediction(equipment);
    const quantityGold = goldPrediction(quantity);
    const scheduleGold = goldPrediction(schedule);
    const equipmentFact = equipmentGold.facts[0];
    const quantityFact = quantityGold.facts[0];
    const scheduleFact = scheduleGold.facts[0];
    if (!equipmentFact || equipmentFact.type !== "equipment_requirement") throw new Error("Missing equipment fact.");
    if (!quantityFact || quantityFact.type !== "quantity") throw new Error("Missing quantity fact.");
    if (!scheduleFact || scheduleFact.type !== "schedule_date") throw new Error("Missing schedule fact.");

    const shortEvidence = locateExcerpt(equipment.pages, { pageNumber: 1, excerpt: "CAT 336" });
    const predictions = {
      ...goldBaselinePredictions([equipment, quantity, schedule]),
      "equipment-requirement": {
        ...equipmentGold,
        facts: [{ ...equipmentFact, evidence: [shortEvidence] }],
      },
      "quantity-unit": {
        ...quantityGold,
        facts: [{ ...quantityFact, amount: "980", originalText: "980 CY" }],
      },
      "schedule-date": {
        ...scheduleGold,
        facts: [{ ...scheduleFact, modality: "historical" as const }],
      },
      "bad-schema": { extractorVersion: "construction-facts-v2", facts: [] },
      "bad-evidence": {
        extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
        facts: [{
          ...equipmentFact,
          evidence: [{ pageNumber: 1, excerpt: "CAT 336", startOffset: 0, endOffset: 3 }],
        }],
      },
    };
    const badSchema: ConstructionFactsFixture = {
      id: "bad-schema",
      description: "Wrong extractor version.",
      pages: equipment.pages,
      expected: equipment.expected,
    };
    const badEvidence: ConstructionFactsFixture = {
      id: "bad-evidence",
      description: "Evidence offsets do not match the excerpt.",
      pages: equipment.pages,
      expected: equipment.expected,
    };
    const report = scoreExtractionQuality(
      [equipment, quantity, schedule, badSchema, badEvidence],
      predictions,
      model,
    );

    expect(report.misses.find((miss) => miss.fixtureId === "equipment-requirement")?.failure).toBe("evidence anchoring");
    expect(report.misses.find((miss) => miss.fixtureId === "quantity-unit")?.failure).toBe("normalization");
    expect(report.misses.find((miss) => miss.fixtureId === "schedule-date")?.failure).toBe("model behavior");
    expect(report.misses.find((miss) => miss.fixtureId === "bad-schema")?.failure).toBe("prompt/schema");
    expect(report.misses.find((miss) => miss.fixtureId === "bad-evidence")?.failure).toBe("parsing");
    expect(precision(report.overall)).toBeLessThan(1);
    expect(report.targets.evidenceCorrectness.achieved).toBe(false);
    expect(report.targets.allMeasuredTargetsMet).toBe(false);
  });

  it("classifies a labeled non-fact as benchmark ambiguity", () => {
    const blank = fixture("unsupported-facts");
    const excerpt = "Does the site have room for a CAT 336 excavator?";
    const evidence = locateExcerpt(blank.pages, { pageNumber: 1, excerpt });
    const report = scoreExtractionQuality([blank], {
      "unsupported-facts": {
        extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
        facts: [{
          type: "equipment_requirement",
          equipment: "CAT 336",
          statement: excerpt,
          modality: "asserted",
          evidence: [evidence],
        }],
      },
    }, {
      ...model,
      context: { "unsupported-facts": { notFacts: [{ pageNumber: 1, excerpt }] } },
    });

    expect(report.misses).toEqual([expect.objectContaining({
      outcome: "unexpected",
      failure: "benchmark ambiguity",
    })]);
    expect(report.overall.unsupportedHighConfidenceFacts).toBe(1);
  });
});
