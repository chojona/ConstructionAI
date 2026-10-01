import { describe, expect, it } from "vitest";
import { readSidebarCollapsed, sidebarStorageKey, writeSidebarCollapsed } from "./sidebarState";

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(sidebarStorageKey, initial);
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

describe("sidebar collapsed state", () => {
  it("treats only the stored 1 as collapsed", () => {
    expect(readSidebarCollapsed(memoryStorage(null))).toBe(false);
    expect(readSidebarCollapsed(memoryStorage("0"))).toBe(false);
    expect(readSidebarCollapsed(memoryStorage("1"))).toBe(true);
    expect(readSidebarCollapsed({ getItem() { throw new Error("blocked"); } })).toBe(false);
  });

  it("writes 1 when collapsing and 0 when expanding", () => {
    const storage = memoryStorage();
    writeSidebarCollapsed(storage, true);
    expect(storage.getItem(sidebarStorageKey)).toBe("1");
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(storage, false);
    expect(storage.getItem(sidebarStorageKey)).toBe("0");
    expect(readSidebarCollapsed(storage)).toBe(false);
  });
});
