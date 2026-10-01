import { describe, expect, it } from "vitest";
import {
  HEAVYJOB_OBJECT_TYPES,
  heavyJobFixtureInserts,
  heavyJobFixtures,
  type HeavyJobFixture,
} from "./fixtures";

const FORBIDDEN_LABEL = /\b(dsc|fa|force account|force-account|change orders?|co|pco|entitlement|candidate|unpaid|claim|overrun|evidence package|detected)\b/i;

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

  it("spreads timecards, installed quantities, diaries, and photos across the job", () => {
    const timecards = heavyJobFixtures.filter((fixture) => fixture.objectType === "timecard");
    expect(new Set(timecards.map((fixture) => String(fixture.raw.date))).size).toBeGreaterThanOrEqual(3);

    const quantities = heavyJobFixtures.filter((fixture) => fixture.objectType === "quantity");
    expect(new Set(quantities.map((fixture) => String(fixture.raw.date))).size).toBeGreaterThanOrEqual(2);
    expect(new Set(quantities.map((fixture) => String(fixture.raw.costCodeId))).size).toBeGreaterThanOrEqual(2);
    const costCodeIds = new Set(heavyJobFixtures.filter((fixture) => fixture.objectType === "cost_code").map((fixture) => fixture.sourceId));
    expect([...new Set(quantities.map((fixture) => String(fixture.raw.costCodeId)))].every((id) => costCodeIds.has(id))).toBe(true);

    const diaries = heavyJobFixtures.filter((fixture) => fixture.objectType === "diary");
    expect(diaries.length).toBeGreaterThanOrEqual(2);
    for (const diary of diaries) {
      const note = `${String(diary.raw.note)} ${String(diary.raw.workingConditions)}`;
      expect(note).toMatch(/rain|clear|overcast|wind|degree|wet/i);
      expect(note).not.toMatch(FORBIDDEN_LABEL);
    }

    const attachments = heavyJobFixtures.filter((fixture) => fixture.objectType === "attachment");
    expect(attachments.some((fixture) => JSON.stringify(fixture.raw.fileReferences).includes("costCode"))).toBe(true);
    expect(attachments.some((fixture) => /Sta\s+\d/.test(`${String(fixture.raw.note)} ${String(fixture.raw.name)}`))).toBe(true);
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
