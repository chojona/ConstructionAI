import { describe, expect, it } from "vitest";
import { projectCardMeta, projectNumberLabel } from "./card";

describe("project cards", () => {
  it("labels a missing number and packs docs with status", () => {
    expect(projectNumberLabel(null)).toBe("No project number");
    expect(projectNumberLabel("  ")).toBe("No project number");
    expect(projectNumberLabel("NS-214")).toBe("NS-214");
    expect(projectCardMeta(1, 0)).toBe("1 doc · All clear");
    expect(projectCardMeta(0, 2)).toBe("0 docs · 2 open");
  });
});
