import { describe, expect, it } from "vitest";
import { parseConstructionFactsV1 } from "./constructionFacts";
import { deterministicConstructionFactsModel, extractConstructionFacts } from "./deterministicExtractor";
import { CONSTRUCTION_FACTS_FIXTURES } from "./eval/fixtures";
import { precision, recall, scoreConstructionFactsEval } from "./eval/score";

describe("deterministic construction-facts extractor", () => {
  it("scores the labeled regression fixtures from page text", () => {
    const predictions = Object.fromEntries(CONSTRUCTION_FACTS_FIXTURES.map((fixture) => {
      const raw = extractConstructionFacts(fixture.pages);
      parseConstructionFactsV1(raw, fixture.pages);
      return [fixture.id, raw];
    }));
    const report = scoreConstructionFactsEval(CONSTRUCTION_FACTS_FIXTURES, predictions);

    expect(precision(report)).toBe(1);
    expect(recall(report)).toBe(1);
    expect(report.fixtures.every((fixture) => fixture.malformed === false)).toBe(true);
  });

  it("keeps distinct mentions of the same equipment and distinct table rows", () => {
    const repeated = "Install 400 LF of silt fence.";
    const page = [
      "A dewatering pump shall be used.",
      "A dewatering pump may be used if groundwater is present.",
      "A dewatering pump shall not be used within 10 feet of the gas line.",
      repeated,
      repeated,
      "Trench excavation | 1,250 CY",
      "Backfill | 1,250 CY",
    ].join("\n");
    const facts = extractConstructionFacts([{ pageNumber: 1, text: page }]).facts;
    const pumps = facts.filter((fact) => fact.type === "equipment_requirement" && fact.equipment === "dewatering pump");
    expect(pumps.map((fact) => fact.modality).sort()).toEqual(["asserted", "asserted", "conditional"]);
    expect(pumps.flatMap((fact) => fact.type === "equipment_requirement" ? [fact.statement] : [])).toEqual(expect.arrayContaining([
      "A dewatering pump shall be used.",
      "A dewatering pump may be used if groundwater is present.",
      "A dewatering pump shall not be used within 10 feet of the gas line.",
    ]));

    const silt = facts.filter((fact) => fact.type === "quantity" && fact.subject === "silt fence");
    expect(silt).toHaveLength(1);
    expect(silt[0]?.evidence[0]).toMatchObject({
      startOffset: page.indexOf(repeated),
      excerpt: repeated,
    });

    const rows = facts.flatMap((fact) => (
      fact.type === "quantity" && fact.originalText === "1,250 CY" ? [fact.subject] : []
    ));
    expect(rows.sort()).toEqual(["backfill", "trench excavation"]);
  });

  it("reads pages and ignores labeled answers", async () => {
    const pages = [{ pageNumber: 1, text: "A CAT 336 excavator shall be used for the trench." }];
    const extracted = await deterministicConstructionFactsModel.extract({
      extractorName: "construction-facts",
      extractorVersion: "construction-facts-v1",
      pages,
    });
    const silent = extractConstructionFacts([{ pageNumber: 1, text: "The weather was clear on Monday." }]);

    expect(extracted).not.toEqual(silent);
    expect(silent).toMatchObject({ facts: [] });
  });
});
