import { describe, expect, it } from "vitest";
import { documentIdentity, documentRowMeta } from "./documentDesk";

describe("documentRowMeta", () => {
  it("uses a set document type and omits an unset one", () => {
    expect(documentRowMeta("Plan set")).toBe("Plan set");
    expect(documentRowMeta("  Drawing  ")).toBe("Drawing");
    expect(documentRowMeta(null)).toBeNull();
    expect(documentRowMeta(undefined)).toBeNull();
    expect(documentRowMeta("   ")).toBeNull();
  });

  it("never invents an unclassified subtitle", () => {
    expect(documentRowMeta(null)).not.toBe("Unclassified document");
    expect(documentIdentity(null, "Drainage Plan")).toBe("Drainage Plan");
    expect(documentIdentity("Plan", "Drainage Plan")).toBe("Plan · Drainage Plan");
  });
});
