import { describe, expect, it } from "vitest";
import type { ProposedFactType, RevisionChangeType } from "@/lib/domain/types";
import { FACT_TYPE_BADGE, REVISION_CHANGE_BADGE, factTypeBadge, queueBadges, revisionChangeBadge, showAiSuggested } from "./factBadge";

describe("fact type badges", () => {
  it("is exhaustive over ProposedFactType", () => {
    const seen: string[] = [];
    for (const factType of Object.keys(FACT_TYPE_BADGE) as ProposedFactType[]) {
      seen.push(factTypeBadge(expectFactType(factType)));
    }
    expect(seen).toEqual(["EQUIPMENT", "SCHEDULE", "QUANTITY"]);
    expect(Object.keys(FACT_TYPE_BADGE)).toHaveLength(3);
    for (const label of seen) {
      expect(label).not.toMatch(/^(DIMENSION|PRODUCT|REQUIREMENT|CONFLICT)$/);
      expect(label).not.toMatch(/confidence/i);
    }
  });

  it("maps revision changes to ADDED, MODIFIED, and REMOVED", () => {
    const seen: string[] = [];
    for (const changeType of Object.keys(REVISION_CHANGE_BADGE) as RevisionChangeType[]) {
      seen.push(revisionChangeBadge(expectChangeType(changeType)));
    }
    expect(seen).toEqual(["ADDED", "MODIFIED", "REMOVED"]);
  });

  it("puts the fact type before the revision change on a queue row", () => {
    expect(queueBadges({
      subject: { type: "revision_change", changeType: "MODIFIED" },
      before: { category: "quantity" },
      after: { category: "quantity" },
    })).toEqual([
      { kind: "fact", label: "QUANTITY" },
      { kind: "change", label: "MODIFIED" },
    ]);
    expect(queueBadges({
      subject: { type: "revision_change", changeType: "REMOVED" },
      before: { category: "schedule_date" },
      after: null,
    })).toEqual([
      { kind: "fact", label: "SCHEDULE" },
      { kind: "change", label: "REMOVED" },
    ]);
    expect(queueBadges({
      subject: { type: "proposed_fact" },
      before: null,
      after: { category: "equipment_requirement" },
    })).toEqual([{ kind: "fact", label: "EQUIPMENT" }]);
    expect(queueBadges({
      subject: { type: "proposed_fact" },
      before: null,
      after: { category: "dimension" },
    })).toEqual([]);
  });

  it("shows AI-suggested only while a fact is unreviewed", () => {
    expect(showAiSuggested(null)).toBe(true);
    expect(showAiSuggested({ decision: "FLAGGED" })).toBe(true);
    expect(showAiSuggested({ decision: "ACCEPTED" })).toBe(false);
    expect(showAiSuggested({ decision: "DISMISSED" })).toBe(false);
  });
});

function expectFactType(factType: ProposedFactType) {
  switch (factType) {
    case "equipment_requirement":
    case "schedule_date":
    case "quantity":
      return factType;
    default: {
      const unknown: never = factType;
      throw new Error(unknown);
    }
  }
}

function expectChangeType(changeType: RevisionChangeType) {
  switch (changeType) {
    case "ADDED":
    case "MODIFIED":
    case "REMOVED":
      return changeType;
    default: {
      const unknown: never = changeType;
      throw new Error(unknown);
    }
  }
}
