import { describe, expect, it } from "vitest";
import { hasUsableText, normalizePageText } from "./pageText";

describe("page text", () => {
  it("normalizes conservatively without rewriting content", () => {
    expect(normalizePageText("  Keep leading\t \r\nLine 2\u0000\n\n\nLine 3  ")).toBe("Keep leading\nLine 2\n\nLine 3");
  });

  it("detects usable text across pages", () => {
    expect(hasUsableText([{ text: " \n" }, { text: "A-101" }])).toBe(true);
    expect(hasUsableText([{ text: " \n" }])).toBe(false);
  });
});
