import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_INTEGRATION_DIR_NAMES,
  FORBIDDEN_LINE_PATTERNS,
  formatWritebackViolations,
  scanV0ProductPathsForUpstreamWriteback,
  V0_PRODUCT_ROOTS,
} from "./v0NoUpstreamWriteback";

describe("CON-79 V0 no upstream writeback guard", () => {
  it("keeps Bluebeam / Procore integration roots out of V0 product trees", () => {
    for (const name of FORBIDDEN_INTEGRATION_DIR_NAMES) {
      for (const root of V0_PRODUCT_ROOTS) {
        expect(scanV0ProductPathsForUpstreamWriteback().some((v) => v.path === `${root}/${name}`)).toBe(false);
      }
    }
  });

  it("has no outbound write clients in V0 product paths", () => {
    const violations = scanV0ProductPathsForUpstreamWriteback();
    expect(violations).toEqual([]);
    expect(formatWritebackViolations(violations)).toContain("CON-79");
  });

  it("recognizes forbidden outbound write signatures", () => {
    const samples = [
      "export async function postToBluebeam(markup: Markup) {}",
      'await fetch("https://api.procore.com/v1/punch_items", { method: "POST" })',
      "export function createHeavyJobPco() {}",
    ];
    for (const sample of samples) {
      expect(FORBIDDEN_LINE_PATTERNS.some(({ pattern }) => pattern.test(sample))).toBe(true);
    }
  });
});
