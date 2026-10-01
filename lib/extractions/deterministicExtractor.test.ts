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
