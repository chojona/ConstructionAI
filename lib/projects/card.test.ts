import { describe, expect, it } from "vitest";
import { projectDocumentsLabel, projectNumberLabel, projectStatusLabel } from "./card";

describe("project cards", () => {
  it("labels a missing number, document counts, and open status", () => {
    expect(projectNumberLabel(null)).toBe("No project number");
    expect(projectNumberLabel("  ")).toBe("No project number");
    expect(projectNumberLabel("NS-214")).toBe("NS-214");
    expect(projectDocumentsLabel(1)).toBe("1 doc");
    expect(projectDocumentsLabel(0)).toBe("0 docs");
    expect(projectStatusLabel(0)).toBe("All clear");
    expect(projectStatusLabel(2)).toBe("2 open");
  });
});
