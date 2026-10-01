import { describe, expect, it } from "vitest";
import type { HeavyJobObjectType } from "./fixtures";
import type { HeavyJobSourceObjectRecord, HeavyJobSourceRepository } from "./repository";
import { listHeavyJobSourceObjects, parseHeavyJobObjectTypeFilter } from "./service";

class FakeHeavyJobRepository implements HeavyJobSourceRepository {
  constructor(private readonly rows: HeavyJobSourceObjectRecord[] | null) {}

  async listForProject(
    _organizationId: string,
    _projectId: string,
    objectType?: HeavyJobObjectType,
  ) {
    if (!this.rows) return null;
    return objectType ? this.rows.filter((row) => row.objectType === objectType) : this.rows;
  }
}

const fetchedAt = new Date("2026-06-13T18:04:00.000Z");

function row(objectType: HeavyJobObjectType): HeavyJobSourceObjectRecord {
  return {
    id: `row_${objectType}`,
    projectId: "project_test",
    objectType,
    sourceId: `source_${objectType}`,
    fetchedAt,
    raw: { id: `source_${objectType}` },
    createdAt: fetchedAt,
  };
}

describe("HeavyJob source object reads", () => {
  it("rejects an unknown object type filter", () => {
    expect(parseHeavyJobObjectTypeFilter(null)).toBeUndefined();
    expect(parseHeavyJobObjectTypeFilter("")).toBeUndefined();
    expect(parseHeavyJobObjectTypeFilter("diary")).toBe("diary");
    expect(() => parseHeavyJobObjectTypeFilter("entitlement")).toThrow();
  });

  it("returns stored snapshots and hides projects outside the organization", async () => {
    const repository = new FakeHeavyJobRepository([row("timecard"), row("diary")]);
    await expect(listHeavyJobSourceObjects("org_a", "project_test", "diary", repository)).resolves.toEqual([
      row("diary"),
    ]);
    await expect(
      listHeavyJobSourceObjects("org_b", "project_test", undefined, new FakeHeavyJobRepository(null)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
