import { describe, expect, it } from "vitest";
import { changePageChip, changeRowTitle } from "./changeRow";

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
  });
});
