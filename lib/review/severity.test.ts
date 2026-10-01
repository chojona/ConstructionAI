import { describe, expect, it } from "vitest";
import type { ComparableFact } from "@/lib/revisions/compareFacts";
import { QUANTITY_HIGH_RELATIVE_CHANGE, SCHEDULE_HIGH_DAY_SHIFT, scoreRevisionChange } from "./severity";

describe("scoreRevisionChange", () => {
  it("keeps wording-only edits low and non-material", () => {
    const scored = scoreRevisionChange({
      changeType: "MODIFIED",
      category: "equipment_requirement",
      material: false,
      basis: "wording",
      before: equipment("tower crane", "A tower crane shall be used."),
      after: equipment("tower crane", "A tower crane is required."),
    });
    expect(scored).toEqual({
      severity: "low",
      disposition: "change_detected",
      rule: "wording.only",
      reason: "Only the wording changed. This is not a material change.",
    });
  });

  it("scores an equipment substitution as high with the values that changed", () => {
    const scored = scoreRevisionChange({
      changeType: "MODIFIED",
      category: "equipment_requirement",
      material: true,
      basis: "identity",
      before: equipment("CAT 320", "A CAT 320 shall be used."),
      after: equipment("CAT 336", "A CAT 336 shall be used."),
    });
    expect(scored).toEqual({
      severity: "high",
      disposition: "material_change",
      rule: "equipment.substitution",
      reason: "Required equipment changed from CAT 320 to CAT 336. Review availability before scheduled work.",
    });
    expect(scored.reason.toLowerCase()).not.toContain("conflict");
  });

  it("scores equipment removal above a new equipment requirement", () => {
    expect(scoreRevisionChange({
      changeType: "REMOVED",
      category: "equipment_requirement",
      material: true,
      basis: "identity",
      before: equipment("dozer", "A dozer shall be used."),
      after: null,
    })).toMatchObject({ severity: "high", disposition: "material_change", rule: "equipment.removed" });
    expect(scoreRevisionChange({
      changeType: "ADDED",
      category: "equipment_requirement",
      material: true,
      basis: "identity",
      before: null,
      after: equipment("dewatering pump", "A dewatering pump shall be provided."),
    })).toMatchObject({ severity: "medium", disposition: "material_change", rule: "equipment.added" });
  });

  it("scores a shall to shall-not reversal as a material modality change", () => {
    const scored = scoreRevisionChange({
      changeType: "MODIFIED",
      category: "equipment_requirement",
      material: true,
      basis: "modality",
      before: equipment("embankment material", "Removed concrete shall be used in embankments."),
      after: equipment("embankment material", "Removed concrete shall not be used in embankments."),
    });
    expect(scored).toMatchObject({
      severity: "high",
      disposition: "material_change",
      rule: "modality.changed",
      reason: "The equipment requirement changed from required to prohibited.",
    });
  });

  it("uses a 7-day threshold for calendar schedule shifts", () => {
    expect(SCHEDULE_HIGH_DAY_SHIFT).toBe(7);
    const shortShift = scoreRevisionChange({
      changeType: "MODIFIED",
      category: "schedule_date",
      material: true,
      basis: "date",
      before: schedule("civil drawings", "2025-06-01", "June 1, 2025"),
      after: schedule("civil drawings", "2025-06-03", "June 3, 2025"),
    });
    const longShift = scoreRevisionChange({
      changeType: "MODIFIED",
      category: "schedule_date",
      material: true,
      basis: "date",
      before: schedule("civil drawings", "2025-06-01", "June 1, 2025"),
      after: schedule("civil drawings", "2025-06-08", "June 8, 2025"),
    });
    expect(shortShift).toMatchObject({ severity: "medium", rule: "schedule.short_shift" });
    expect(shortShift.reason).toContain("a shift of 2 days");
    expect(longShift).toMatchObject({
      severity: "high",
      rule: "schedule.day_shift",
      reason: "Schedule date for civil drawings changed from June 1, 2025 to June 8, 2025, a shift of 7 days.",
    });
  });

  it("keeps an unparsed schedule change high because the shift cannot be measured", () => {
    expect(scoreRevisionChange({
      changeType: "MODIFIED",
      category: "schedule_date",
      material: true,
      basis: "date",
      before: schedule("notice to proceed", null, "mid October"),
      after: schedule("notice to proceed", null, "mid November"),
    })).toMatchObject({
      severity: "high",
      rule: "schedule.unparsed",
      reason: "Schedule date for notice to proceed changed from mid October to mid November. The dates are not both calendar dates, so the size of the shift is not measured.",
    });
  });

  it("uses a 10% threshold for quantity changes and keeps unit changes high", () => {
    expect(QUANTITY_HIGH_RELATIVE_CHANGE).toBe(0.1);
    expect(scoreRevisionChange({
      changeType: "MODIFIED",
      category: "quantity",
      material: true,
      basis: "numeric",
      before: quantity("trench excavation", "100", "cubic yards"),
      after: quantity("trench excavation", "91", "cubic yards"),
    })).toMatchObject({ severity: "medium", rule: "quantity.small_change" });
    expect(scoreRevisionChange({
      changeType: "MODIFIED",
      category: "quantity",
      material: true,
      basis: "numeric",
      before: quantity("trench excavation", "100", "cubic yards"),
      after: quantity("trench excavation", "90", "cubic yards"),
    })).toMatchObject({
      severity: "high",
      rule: "quantity.relative_change",
      reason: "Quantity for trench excavation changed from 100 cubic yards to 90 cubic yards, a 10.0% change.",
    });
    expect(scoreRevisionChange({
      changeType: "MODIFIED",
      category: "quantity",
      material: true,
      basis: "unit",
      before: quantity("trench excavation", "100", "cubic yards"),
      after: quantity("trench excavation", "100", "tons"),
    })).toMatchObject({
      severity: "high",
      rule: "quantity.unit",
      reason: "Quantity unit for trench excavation changed from cubic yards to tons. The amounts are not compared on one scale.",
    });
  });

  it("reserves critical for external conflict evidence", () => {
    const added = {
      changeType: "ADDED" as const,
      category: "equipment_requirement" as const,
      material: true,
      basis: "identity" as const,
      before: null,
      after: equipment("CAT 336", "A CAT 336 shall be used."),
    };
    expect(scoreRevisionChange(added).severity).toBe("medium");
    expect(scoreRevisionChange(added, { kind: "equipment_assignment", summary: "   " }).severity).toBe("medium");
    expect(scoreRevisionChange(added, {
      kind: "schedule_commitment",
      summary: "Work is planned for June.",
    }).disposition).toBe("material_change");
    expect(scoreRevisionChange(added, {
      kind: "equipment_assignment",
      summary: "CAT 320 is assigned to this activity.",
    })).toEqual({
      severity: "critical",
      disposition: "proven_conflict",
      rule: "conflict.equipment_assignment",
      reason: "Equipment conflict: the document requires CAT 336, and the assignment record says CAT 320 is assigned to this activity.",
    });
  });

  it("returns the same severity for the same normalized input", () => {
    const change = {
      changeType: "MODIFIED" as const,
      category: "quantity" as const,
      material: true,
      basis: "numeric" as const,
      before: quantity("fill", "20", "CY"),
      after: quantity("fill", "21", "CY"),
    };
    expect(scoreRevisionChange(change)).toEqual(scoreRevisionChange(change));
    expect(scoreRevisionChange(change).severity).toBe("medium");
  });
});

function equipment(name: string, statement: string): ComparableFact {
  return fact("equipment_requirement", { equipment: name, statement, modality: "asserted" });
}

function schedule(event: string, date: string | null, dateText: string): ComparableFact {
  return fact("schedule_date", { event, date, dateText, modality: "asserted" });
}

function quantity(subject: string, amount: string, unit: string): ComparableFact {
  return fact("quantity", { subject, amount, unit, originalText: `${amount} ${unit}`, modality: "asserted" });
}

function fact(factType: ComparableFact["factType"], payload: Record<string, string | null>): ComparableFact {
  return {
    factType,
    payload,
    evidence: [{ pageNumber: 1, excerpt: "excerpt", startOffset: 0, endOffset: 7 }],
  };
}
