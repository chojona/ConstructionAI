import { describe, expect, it } from "vitest";
import { changeEvidenceLead, changePageChip, changeRowTitle } from "./changeRow";

describe("change rows", () => {
  it("names a quantity change and its page", () => {
    const finding = {
      subject: { type: "revision_change", changeType: "MODIFIED" },
      before: { category: "quantity" as const, evidence: [{ pageNumber: 1 }] },
      after: { category: "quantity" as const, evidence: [{ pageNumber: 1 }] },
      evidence: [],
    };
    expect(changeRowTitle(finding)).toBe("Quantity changed");
    expect(changePageChip(finding)).toBe("p. 1");
    expect(changeEvidenceLead(finding)).toEqual({ page: 1, excerpt: "No linked excerpt available." });
  });

  it("prefers the after excerpt for the evidence lead", () => {
    const finding = {
      subject: { type: "revision_change", changeType: "MODIFIED" },
      before: { category: "quantity" as const, evidence: [{ pageNumber: 2, excerpt: "before" }] },
      after: { category: "quantity" as const, evidence: [{ pageNumber: 3, excerpt: "after text" }] },
      evidence: [],
    };
    expect(changeEvidenceLead(finding)).toEqual({ page: 3, excerpt: "after text" });
  });
});
