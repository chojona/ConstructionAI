import { describe, expect, it } from "vitest";
import {
  HEAVYJOB_OBJECT_TYPES,
  heavyJobFixtureInserts,
  heavyJobFixtures,
  type HeavyJobFixture,
} from "./fixtures";

const FORBIDDEN_LABEL = /\b(entitlement|dsc|force account|change[- ]order|overrun|candidate|evidence package|detected)\b/i;

function fixtureOf(objectType: HeavyJobFixture["objectType"]) {
  const fixture = heavyJobFixtures.find((item) => item.objectType === objectType);
  expect(fixture).toBeDefined();
  return fixture!;
}

describe("HeavyJob fixtures", () => {
  it("covers the five object types without entitlement labels", () => {
    expect(new Set(heavyJobFixtures.map((fixture) => fixture.objectType))).toEqual(new Set(HEAVYJOB_OBJECT_TYPES));
    expect(JSON.stringify(heavyJobFixtures)).not.toMatch(FORBIDDEN_LABEL);
    for (const fixture of heavyJobFixtures) {
      expect(fixture.sourceId.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(fixture.fetchedAt))).toBe(false);
      expect(fixture.raw).toEqual(expect.any(Object));
    }
  });

  it("keeps timecard isTm and isRework as raw booleans", () => {
    const costCodes = fixtureOf("timecard").raw.costCodes;
    expect(Array.isArray(costCodes)).toBe(true);
    const lines = costCodes as Array<Record<string, unknown>>;
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(typeof line.isTm).toBe("boolean");
      expect(typeof line.isRework).toBe("boolean");
    }
    expect(lines.some((line) => line.isTm === true)).toBe(true);
    expect(lines.some((line) => line.isRework === true)).toBe(true);
  });

  it("stores installed and consumed quantities, diary text, and attachment metadata", () => {
    const quantity = fixtureOf("quantity").raw;
    expect(typeof quantity.installedQuantity).toBe("number");
    expect(typeof quantity.consumedQuantity).toBe("number");

    const diary = fixtureOf("diary").raw;
    expect(typeof diary.note).toBe("string");
    expect(diary.workingConditions).toBe(diary.workingConditionNote);
    expect(String(diary.note)).toMatch(/Sta 12\+40/);

    const attachment = fixtureOf("attachment").raw;
    expect(attachment.mimeType).toBe("image/jpeg");
    expect(attachment.name).toBe("sta-12-40-subgrade.jpg");
    expect(attachment).not.toHaveProperty("bytes");
    expect(attachment).not.toHaveProperty("content");
  });

  it("builds insert rows that keep provenance on the given project", () => {
    const rows = heavyJobFixtureInserts("project_test");
    expect(rows).toHaveLength(heavyJobFixtures.length);
    for (const row of rows) {
      expect(row.projectId).toBe("project_test");
      expect(row.sourceId.length).toBeGreaterThan(0);
      expect(row.fetchedAt).toBeInstanceOf(Date);
      expect(row.raw).toEqual(expect.any(Object));
      expect(HEAVYJOB_OBJECT_TYPES).toContain(row.objectType);
    }
  });
});
