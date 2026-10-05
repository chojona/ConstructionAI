import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID } from "./demoUser";
import type { MembershipLookup, MembershipRecord } from "./roles";

const { headerState } = vi.hoisted(() => ({
  headerState: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerState.get(name.toLowerCase()) ?? null,
  }),
}));

import { authorizePage } from "./pageAccess";

const previousOrg = process.env.APP_ORGANIZATION_ID;
const previousInterrupt = process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS;

function setHeaders(values: Record<string, string>) {
  headerState.clear();
  for (const [key, value] of Object.entries(values)) headerState.set(key.toLowerCase(), value);
}

function member(overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "userId" | "role">): MembershipRecord {
  return { id: overrides.id ?? `membership_${overrides.userId}_${overrides.organizationId}`, status: "ACTIVE", ...overrides };
}

function lookup(rows: MembershipRecord[]): MembershipLookup {
  return {
    async findMembership(userId, organizationId) {
      return rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null;
    },
    async listActiveMemberships(userId) {
      return rows.filter((row) => row.userId === userId && row.status === "ACTIVE");
    },
  };
}

beforeEach(() => {
  headerState.clear();
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "1";
});

afterEach(() => {
  if (previousOrg === undefined) delete process.env.APP_ORGANIZATION_ID;
  else process.env.APP_ORGANIZATION_ID = previousOrg;
  if (previousInterrupt === undefined) delete process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS;
  else process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = previousInterrupt;
});

describe("authorizePage", () => {
  const members = lookup([
    member({ organizationId: "org_a", userId: "user_a", role: "VIEWER" }),
    member({ organizationId: "org_b", userId: "user_b", role: "ORG_ADMIN" }),
    member({ organizationId: "org_a", userId: "user_invited", role: "REVIEWER", status: "INVITED" }),
    member({ organizationId: "org_a", userId: "user_off", role: "REVIEWER", status: "DISABLED" }),
  ]);

  it("denies a member of org A who asks for org B", async () => {
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    await expect(authorizePage("read", members)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  });

  it("lets that member read their own organization", async () => {
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_a" });
    await expect(authorizePage("read", members)).resolves.toMatchObject({
      organizationId: "org_a",
      userId: "user_a",
      role: "VIEWER",
      named: true,
    });
  });

  it("denies an invited member and a disabled member", async () => {
    setHeaders({ "x-user-id": "user_invited", "x-organization-id": "org_a" });
    await expect(authorizePage("read", members)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
    setHeaders({ "x-user-id": "user_off", "x-organization-id": "org_a" });
    await expect(authorizePage("read", members)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  });

  it("follows a seeded demo membership and does not bootstrap over it", async () => {
    process.env.APP_ORGANIZATION_ID = "org_demo";
    const seeded = lookup([member({ organizationId: "org_demo", userId: DEMO_USER_ID, role: "VIEWER" })]);
    await expect(authorizePage("read", seeded)).resolves.toMatchObject({
      organizationId: "org_demo",
      userId: DEMO_USER_ID,
      role: "VIEWER",
      named: false,
    });
    const invited = lookup([
      member({ organizationId: "org_demo", userId: DEMO_USER_ID, role: "ORG_ADMIN", status: "INVITED" }),
    ]);
    await expect(authorizePage("read", invited)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  });

  it("keeps the unnamed demo desk on the process organization only", async () => {
    process.env.APP_ORGANIZATION_ID = "org_demo";
    await expect(authorizePage("read", lookup([]))).resolves.toMatchObject({
      organizationId: "org_demo",
      role: "ORG_ADMIN",
      named: false,
    });
    setHeaders({ "x-organization-id": "org_b" });
    await expect(authorizePage("read", lookup([]))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  });
});
