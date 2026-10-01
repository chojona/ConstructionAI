import { describe, expect, it } from "vitest";
import { extractConstructionFacts } from "@/lib/extractions/deterministicExtractor";
import type { ProposedConstructionFact } from "@/lib/extractions/constructionFacts";
import { compareFacts, type ComparableFact } from "@/lib/revisions/compareFacts";
import { scoreRevisionChange } from "@/lib/review/severity";
import { DEMO_REVIEW_REVISIONS } from "./reviewProject";

describe("demo review project", () => {
  it("reuses the quantity fixture so change review has a material finding", () => {
    const [before, after] = DEMO_REVIEW_REVISIONS.map((revision) => (
      extractConstructionFacts([{ pageNumber: 1, text: revision.text }]).facts.map(toComparable)
    ));
    expect(before.map((fact) => fact.payload.amount)).toEqual(["1250"]);
    expect(after.map((fact) => fact.payload.amount)).toEqual(["1500"]);
    const changes = compareFacts(before, after);
    expect(changes).toEqual([
      expect.objectContaining({ changeType: "MODIFIED", category: "quantity", material: true }),
    ]);
    const scored = scoreRevisionChange(changes[0]!);
    expect(scored.disposition).toBe("material_change");
    expect(scored.severity).not.toBe("low");
  });
});

function toComparable(fact: ProposedConstructionFact, index: number): ComparableFact {
  const payload: Record<string, string | null> = fact.type === "equipment_requirement"
    ? { equipment: fact.equipment, statement: fact.statement, modality: fact.modality }
    : fact.type === "schedule_date"
      ? { event: fact.event, date: fact.date, dateText: fact.dateText, modality: fact.modality }
      : { subject: fact.subject, amount: fact.amount, unit: fact.unit, originalText: fact.originalText, modality: fact.modality };
  return { factType: fact.type, ordinal: index, payload, evidence: fact.evidence.map((item) => ({ ...item })) };
}
