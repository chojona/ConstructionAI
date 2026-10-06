import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MembershipRecord, OrgRole } from "./roles";

const {
  findMembership,
  listActiveMemberships,
  listMembershipsForUser,
  listPeople,
  inviteMember,
  disableMember,
  enableMember,
  changeMemberRole,
  refreshAcceptToken,
} = vi.hoisted(() => ({
  findMembership: vi.fn(),
  listActiveMemberships: vi.fn(),
  listMembershipsForUser: vi.fn(),
  listPeople: vi.fn(),
  inviteMember: vi.fn(),
  disableMember: vi.fn(),
  enableMember: vi.fn(),
  changeMemberRole: vi.fn(),
  refreshAcceptToken: vi.fn(),
}));

vi.mock("@/lib/auth/prismaMembership", () => ({
  membershipStore: { findMembership, listActiveMemberships, listMembershipsForUser },
}));

vi.mock("@/lib/auth/people", () => ({
  listPeople,
  inviteMember,
  disableMember,
  enableMember,
  changeMemberRole,
  refreshAcceptToken,
}));

import { GET as listRoute, POST as inviteRoute } from "@/app/api/org/memberships/route";
import { POST as disableRoute } from "@/app/api/org/memberships/[membershipId]/disable/route";
import { POST as enableRoute } from "@/app/api/org/memberships/[membershipId]/enable/route";
import { POST as roleRoute } from "@/app/api/org/memberships/[membershipId]/role/route";
import { POST as acceptTokenRoute } from "@/app/api/org/memberships/[membershipId]/accept-token/route";

const rows: MembershipRecord[] = [];

function member(role: OrgRole, userId: string, status: MembershipRecord["status"] = "ACTIVE"): MembershipRecord {
  return { id: `membership_${userId}`, organizationId: "org_a", userId, role, status };
}

function headers(userId: string) {
  return { "x-user-id": userId, "x-organization-id": "org_a" };
}

function context() {
  return { params: Promise.resolve({ membershipId: "membership_1" }) };
}

const peopleFns = [listPeople, inviteMember, disableMember, enableMember, changeMemberRole, refreshAcceptToken];

describe("people API role gates", () => {
  beforeEach(() => {
    rows.length = 0;
    findMembership.mockImplementation(async (userId: string, organizationId: string) =>
      rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null);
    listActiveMemberships.mockImplementation(async (userId: string) =>
      rows.filter((row) => row.userId === userId && row.status === "ACTIVE"));
    listMembershipsForUser.mockImplementation(async (userId: string) =>
      rows.filter((row) => row.userId === userId));
    for (const fn of peopleFns) fn.mockReset();
    listPeople.mockResolvedValue([]);
    inviteMember.mockResolvedValue({ id: "membership_new", acceptPath: "/accept?token=once" });
    disableMember.mockResolvedValue({ id: "membership_1", status: "DISABLED" });
    enableMember.mockResolvedValue({ id: "membership_1", status: "ACTIVE", role: "REVIEWER" });
    changeMemberRole.mockResolvedValue({ id: "membership_1", role: "CONTRIBUTOR" });
    refreshAcceptToken.mockResolvedValue({ acceptToken: "once", acceptPath: "/accept?token=once" });
  });

  async function callAll(userId: string) {
    const list = await listRoute(new NextRequest("http://localhost/api/org/memberships", { headers: headers(userId) }));
    const invite = await inviteRoute(new NextRequest("http://localhost/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers(userId) },
      body: JSON.stringify({ email: "pe@northstar.example", role: "VIEWER" }),
    }));
    const disable = await disableRoute(new NextRequest("http://localhost/api/org/memberships/membership_1/disable", {
      method: "POST",
      headers: headers(userId),
    }), context());
    const enable = await enableRoute(new NextRequest("http://localhost/api/org/memberships/membership_1/enable", {
      method: "POST",
      headers: headers(userId),
    }), context());
    const role = await roleRoute(new NextRequest("http://localhost/api/org/memberships/membership_1/role", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers(userId) },
      body: JSON.stringify({ role: "CONTRIBUTOR" }),
    }), context());
    const accept = await acceptTokenRoute(new NextRequest("http://localhost/api/org/memberships/membership_1/accept-token", {
      method: "POST",
      headers: headers(userId),
    }), context());
    return [list, invite, disable, enable, role, accept];
  }

  it("denies Reviewer, Contributor, Viewer, and a disabled org admin", async () => {
    for (const role of ["REVIEWER", "CONTRIBUTOR", "VIEWER"] as const) {
      rows.length = 0;
      rows.push(member(role, "user_member"));
      for (const fn of peopleFns) fn.mockClear();
      const responses = await callAll("user_member");
      for (const response of responses) {
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
      }
      for (const fn of peopleFns) expect(fn).not.toHaveBeenCalled();
    }

    rows.length = 0;
    rows.push(member("ORG_ADMIN", "user_off", "DISABLED"));
    for (const fn of peopleFns) fn.mockClear();
    const responses = await callAll("user_off");
    for (const response of responses) expect(response.status).toBe(403);
    for (const fn of peopleFns) expect(fn).not.toHaveBeenCalled();
  });

  it("requires a session and does not trust a user header when that switch is off", async () => {
    rows.push(member("ORG_ADMIN", "user_admin"));
    const previous = process.env.AUTH_TRUST_USER_HEADER;
    delete process.env.AUTH_TRUST_USER_HEADER;
    try {
      const response = await listRoute(new NextRequest("http://localhost/api/org/memberships", {
        headers: headers("user_admin"),
      }));
      expect(response.status).toBe(401);
      expect(listPeople).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.AUTH_TRUST_USER_HEADER;
      else process.env.AUTH_TRUST_USER_HEADER = previous;
    }
  });

  it("lets an org admin list, invite, change role, disable, re-enable, and refresh an accept link", async () => {
    rows.push(member("ORG_ADMIN", "user_admin"));
    const [list, invite, disable, enable, role, accept] = await callAll("user_admin");
    expect(list.status).toBe(200);
    expect(invite.status).toBe(201);
    expect(disable.status).toBe(200);
    expect(enable.status).toBe(200);
    expect(role.status).toBe(200);
    expect(accept.status).toBe(200);

    const access = expect.objectContaining({ role: "ORG_ADMIN", userId: "user_admin", organizationId: "org_a" });
    expect(listPeople).toHaveBeenCalledWith(access);
    expect(inviteMember).toHaveBeenCalledWith(access, { email: "pe@northstar.example", role: "VIEWER" });
    expect(disableMember).toHaveBeenCalledWith(access, "membership_1");
    expect(enableMember).toHaveBeenCalledWith(access, "membership_1");
    expect(changeMemberRole).toHaveBeenCalledWith(access, "membership_1", { role: "CONTRIBUTOR" });
    expect(refreshAcceptToken).toHaveBeenCalledWith(access, "membership_1");
  });

  it("rejects an org admin aimed at a different organization", async () => {
    rows.push({ id: "membership_b", organizationId: "org_b", userId: "user_b", role: "ORG_ADMIN", status: "ACTIVE" });
    const responses = await callAll("user_b");
    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    for (const fn of peopleFns) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects an invited caller", async () => {
    rows.push(member("REVIEWER", "user_invited", "INVITED"));
    const responses = await callAll("user_invited");
    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "FORBIDDEN", message: "Accept the invitation before using the organization." },
      });
    }
    for (const fn of peopleFns) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before it changes a membership", async () => {
    rows.push(member("ORG_ADMIN", "user_admin"));
    const invite = await inviteRoute(new NextRequest("http://localhost/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers("user_admin") },
      body: "{",
    }));
    const role = await roleRoute(new NextRequest("http://localhost/api/org/memberships/membership_1/role", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers("user_admin") },
      body: "{",
    }), context());
    expect(invite.status).toBe(400);
    expect(role.status).toBe(400);
    await expect(invite.json()).resolves.toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(inviteMember).not.toHaveBeenCalled();
    expect(changeMemberRole).not.toHaveBeenCalled();
  });
});
