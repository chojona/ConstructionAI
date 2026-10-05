import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_USER_ID } from "./demoUser";
import { authorizeRequest, withLedgerActor } from "./membership";
import { hashToken, SESSION_COOKIE } from "./sessionToken";
import { ORG_ROLES, ROLE_PERMISSIONS, type MembershipLookup, type MembershipRecord } from "./roles";

const previousOrg = process.env.APP_ORGANIZATION_ID;

afterEach(() => {
  if (previousOrg === undefined) delete process.env.APP_ORGANIZATION_ID;
  else process.env.APP_ORGANIZATION_ID = previousOrg;
});

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/projects/project_1/export", { headers });
}

function member(overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "userId" | "role">): MembershipRecord {
  return {
    id: overrides.id ?? `membership_${overrides.userId}`,
    status: "ACTIVE",
    ...overrides,
  };
}

function lookup(rows: MembershipRecord[]): MembershipLookup {
  return {
    async findMembership(userId, organizationId) {
      return rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null;
    },
    async listActiveMemberships(userId) {
      return rows.filter((row) => row.userId === userId && row.status === "ACTIVE");
    },
    async listMembershipsForUser(userId) {
      return rows.filter((row) => row.userId === userId);
    },
  };
}

describe("org role matrix", () => {
  it("keeps the four locked V0 roles and no claimant roles", () => {
    expect(ORG_ROLES).toEqual(["ORG_ADMIN", "REVIEWER", "CONTRIBUTOR", "VIEWER"]);
    expect(ROLE_PERMISSIONS).toEqual({
      ORG_ADMIN: ["read", "upload", "approve", "export", "draft_email", "manage_people"],
      REVIEWER: ["read", "approve", "export", "draft_email"],
      CONTRIBUTOR: ["read", "upload"],
      VIEWER: ["read"],
    });
  });
});

describe("authorizeRequest", () => {
  const rows = [
    member({ id: "m_a", organizationId: "org_a", userId: "user_a", role: "REVIEWER" }),
    member({ id: "m_b", organizationId: "org_b", userId: "user_b", role: "ORG_ADMIN" }),
    member({ id: "m_off", organizationId: "org_a", userId: "user_off", role: "REVIEWER", status: "DISABLED" }),
    member({ id: "m_invited", organizationId: "org_a", userId: "user_invited", role: "REVIEWER", status: "INVITED" }),
    member({ id: "m_view", organizationId: "org_a", userId: "user_view", role: "VIEWER" }),
    member({ id: "m_contrib", organizationId: "org_a", userId: "user_contrib", role: "CONTRIBUTOR" }),
  ];
  const members = lookup(rows);

  it("denies a member of org A when they ask for org B", async () => {
    await expect(authorizeRequest(request({
      "x-user-id": "user_a",
      "x-organization-id": "org_b",
    }), "read", members)).rejects.toMatchObject({ code: "FORBIDDEN", httpStatus: 403 });
  });

  it("lets that member read their own organization", async () => {
    await expect(authorizeRequest(request({
      "x-user-id": "user_a",
      "x-organization-id": "org_a",
    }), "read", members)).resolves.toMatchObject({
      organizationId: "org_a",
      userId: "user_a",
      role: "REVIEWER",
      named: true,
    });
  });

  it("uses the caller's only active membership when no organization header is sent", async () => {
    await expect(authorizeRequest(request({ "x-user-id": "user_a" }), "read", members)).resolves.toMatchObject({
      organizationId: "org_a",
      userId: "user_a",
    });
  });

  it("requires an organization when the person has more than one active membership", async () => {
    const both = lookup([
      member({ organizationId: "org_a", userId: "user_both", role: "VIEWER" }),
      member({ organizationId: "org_b", userId: "user_both", role: "VIEWER" }),
    ]);
    await expect(authorizeRequest(request({ "x-user-id": "user_both" }), "read", both)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Choose an organization.",
    });
  });

  it("denies a disabled member", async () => {
    await expect(authorizeRequest(request({
      "x-user-id": "user_off",
      "x-organization-id": "org_a",
    }), "read", members)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This account is disabled for the organization.",
    });
    await expect(authorizeRequest(request({ "x-user-id": "user_off" }), "read", members)).rejects.toMatchObject({
      message: "This account is disabled for the organization.",
    });
  });

  it("denies an invited member until they are active", async () => {
    await expect(authorizeRequest(request({
      "x-user-id": "user_invited",
      "x-organization-id": "org_a",
    }), "read", members)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies Approve and export to a Viewer and allows both to a Reviewer", async () => {
    for (const permission of ["approve", "export"] as const) {
      await expect(authorizeRequest(request({
        "x-user-id": "user_view",
        "x-organization-id": "org_a",
      }), permission, members)).rejects.toMatchObject({ code: "FORBIDDEN", message: "Your role cannot do that." });
      await expect(authorizeRequest(request({
        "x-user-id": "user_a",
        "x-organization-id": "org_a",
      }), permission, members)).resolves.toMatchObject({ role: "REVIEWER" });
    }
  });

  it("lets a Contributor upload and keeps Approve and export with the Reviewer", async () => {
    await expect(authorizeRequest(request({
      "x-user-id": "user_contrib",
      "x-organization-id": "org_a",
    }), "upload", members)).resolves.toMatchObject({ role: "CONTRIBUTOR" });
    await expect(authorizeRequest(request({
      "x-user-id": "user_a",
      "x-organization-id": "org_a",
    }), "upload", members)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authorizeRequest(request({
      "x-user-id": "user_contrib",
      "x-organization-id": "org_a",
    }), "approve", members)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an org admin manage people and denies that to a Reviewer", async () => {
    await expect(authorizeRequest(request({
      "x-user-id": "user_b",
      "x-organization-id": "org_b",
    }), "manage_people", members)).resolves.toMatchObject({ role: "ORG_ADMIN" });
    await expect(authorizeRequest(request({
      "x-user-id": "user_a",
      "x-organization-id": "org_a",
    }), "manage_people", members)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not treat a named demo id as an admin when no membership exists", async () => {
    process.env.APP_ORGANIZATION_ID = "org_demo";
    await expect(authorizeRequest(request({ "x-user-id": DEMO_USER_ID }), "read", lookup([]))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a request that has no session and no trusted user header", async () => {
    process.env.APP_ORGANIZATION_ID = "org_demo";
    const seeded = lookup([
      member({ organizationId: "org_demo", userId: DEMO_USER_ID, role: "ORG_ADMIN" }),
    ]);
    await expect(authorizeRequest(request(), "export", seeded)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      httpStatus: 401,
      message: "Sign in to continue.",
    });
    await expect(authorizeRequest(request({ "x-organization-id": "org_b" }), "read", seeded)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("ignores x-user-id unless the temporary header trust is enabled", async () => {
    const previous = process.env.AUTH_TRUST_USER_HEADER;
    delete process.env.AUTH_TRUST_USER_HEADER;
    try {
      await expect(authorizeRequest(request({
        "x-user-id": "user_a",
        "x-organization-id": "org_a",
      }), "read", members)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    } finally {
      if (previous === undefined) delete process.env.AUTH_TRUST_USER_HEADER;
      else process.env.AUTH_TRUST_USER_HEADER = previous;
    }
  });

  it("authorizes the user stored on a valid session cookie", async () => {
    const token = "session-token-value";
    const sessions = {
      async findValidSession(tokenHash: string) {
        return tokenHash === hashToken(token) ? { userId: "user_a" } : null;
      },
    };
    const signedIn = new NextRequest("http://localhost/api/projects/project_1/export", {
      headers: { cookie: `${SESSION_COOKIE}=${token}`, "x-organization-id": "org_a" },
    });
    await expect(authorizeRequest(signedIn, "read", members, sessions)).resolves.toMatchObject({
      organizationId: "org_a",
      userId: "user_a",
      role: "REVIEWER",
      named: true,
    });
  });

  it("stores the User id on a named ledger write and leaves an unnamed body unchanged", () => {
    const named = { organizationId: "org_a", userId: "user_a", role: "REVIEWER" as const, named: true };
    expect(withLedgerActor(named, { actorId: "Alex Chen", status: "SENT" })).toMatchObject({ actorId: "user_a" });
    const demo = { ...named, named: false };
    expect(withLedgerActor(demo, { actorId: "Alex Chen" })).toMatchObject({ actorId: "Alex Chen" });
  });
});
