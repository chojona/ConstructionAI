import { describe, expect, it } from "vitest";
import {
  auditWeakWedgeSchemaWall,
  bannedLabelForIdentifier,
  collectPrismaIdentifiers,
  formatSchemaWallFailures,
  normalizeIdentifier,
} from "./weakWedgeSchemaWall";

describe("weak wedge schema wall", () => {
  it("normalizes camelCase and kebab-case identifiers", () => {
    expect(normalizeIdentifier("changeType")).toBe("change_type");
    expect(normalizeIdentifier("force-account")).toBe("force_account");
  });

  it("flags banned product identifiers", () => {
    expect(bannedLabelForIdentifier("EntitlementCandidate")).toBe("entitlement");
    expect(bannedLabelForIdentifier("co_candidate")).toBe("candidate");
    expect(bannedLabelForIdentifier("dsc_status")).toBe("dsc");
    expect(bannedLabelForIdentifier("isForceAccount")).toBe("force-account");
    expect(bannedLabelForIdentifier("change_order_id")).toBe("change-order");
    expect(bannedLabelForIdentifier("pcoNumber")).toBe("pco");
    expect(bannedLabelForIdentifier("detection_signal")).toBe("detection-signal");
  });

  it("allows revision-change spine identifiers", () => {
    expect(bannedLabelForIdentifier("RevisionChangeType")).toBeNull();
    expect(bannedLabelForIdentifier("changeType")).toBeNull();
    expect(bannedLabelForIdentifier("beforeProposedFactId")).toBeNull();
  });

  it("rejects banned identifiers inside prisma schema samples", () => {
    const sample = `
enum EntitlementStatus {
  OPEN
}

model CoCandidate {
  id String @id
  dscFlag Boolean
}
`;
    const hits = collectPrismaIdentifiers(sample, "sample.prisma");
    expect(hits.map((hit) => hit.identifier).sort()).toEqual(
      ["CoCandidate", "EntitlementStatus", "dscFlag"].sort(),
    );
    expect(hits.some((hit) => hit.label === "candidate")).toBe(true);
    expect(hits.some((hit) => hit.label === "entitlement")).toBe(true);
    expect(hits.some((hit) => hit.label === "dsc")).toBe(true);
  });

  it("passes the current prisma schema and API DTO layer", () => {
    const hits = auditWeakWedgeSchemaWall();
    if (hits.length > 0) {
      throw new Error(`WEAK wedge schema wall violated:\n${formatSchemaWallFailures(hits)}`);
    }
    expect(hits).toEqual([]);
  });
});
