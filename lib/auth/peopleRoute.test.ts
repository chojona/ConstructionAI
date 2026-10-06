import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MembershipRecord, OrgRole, PersonMembership, PersonRecord } from "./roles";

const { store } = vi.hoisted(() => {
  class MemoryPeople {
  users: PersonRecord[] = [];
  memberships: MembershipRecord[] = [];
  passwords = new Set<string>();
  private sequence = 0;
  private updatedAt = new Map<string, Date>();

  reset() {
    this.users = [];
    this.memberships = [];
    this.passwords = new Set();
    this.sequence = 0;
    this.updatedAt = new Map();
  }

  async findMembership(userId: string, organizationId: string) {
    return this.memberships.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null;
  }

  async listActiveMemberships(userId: string) {
    return this.memberships.filter((row) => row.userId === userId && row.status === "ACTIVE");
  }

  async listMembershipsForUser(userId: string) {
    return this.memberships.filter((row) => row.userId === userId);
  }

  async findValidSession() {
    return null;
  }

  async findUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createUser(input: { email: string; name: string | null }) {
    const user = { id: `user_${++this.sequence}`, email: input.email, name: input.name };
    this.users.push(user);
    return user;
  }

  async createMembership(input: {
    organizationId: string;
    userId: string;
    role: OrgRole;
    status: MembershipRecord["status"];
  }) {
    const row: MembershipRecord = { id: `membership_${++this.sequence}`, ...input };
    this.memberships.push(row);
    this.updatedAt.set(row.id, new Date("2026-10-06T00:00:00.000Z"));
    return row;
  }

  async findMembershipById(id: string) {
    return this.memberships.find((row) => row.id === id) ?? null;
  }

  async setStatus(id: string, status: MembershipRecord["status"]) {
    const row = this.memberships.find((item) => item.id === id);
    if (!row) throw new Error(`missing ${id}`);
    row.status = status;
    return row;
  }

  async setRole(id: string, role: OrgRole) {
    const row = this.memberships.find((item) => item.id === id);
    if (!row) throw new Error(`missing ${id}`);
    row.role = role;
    return row;
  }

  async userHasPassword(userId: string) {
    return this.passwords.has(userId);
  }

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.memberships.filter((row) =>
      row.organizationId === organizationId && row.role === role && row.status === "ACTIVE").length;
  }

  async saveAcceptToken() {}

  async listPeople(organizationId: string): Promise<PersonMembership[]> {
    return this.memberships.filter((row) => row.organizationId === organizationId).map((row) => {
      const user = this.users.find((item) => item.id === row.userId);
      return {
        membershipId: row.id,
        organizationId: row.organizationId,
        userId: row.userId,
        email: user?.email ?? "",
        name: user?.name ?? null,
        role: row.role,
        status: row.status,
        updatedAt: this.updatedAt.get(row.id) ?? new Date(0),
      };
    });
  }
}

  return { store: new MemoryPeople() };
});

vi.mock("@/lib/auth/prismaMembership", () => ({ membershipStore: store }));

import { GET, POST } from "@/app/api/org/memberships/route";
import { PATCH } from "@/app/api/org/memberships/[membershipId]/route";
import { POST as disableMember } from "@/app/api/org/memberships/[membershipId]/disable/route";
import { POST as enableMember } from "@/app/api/org/memberships/[membershipId]/enable/route";

function headers(userId: string) {
  return { "x-user-id": userId, "x-organization-id": "org_a" };
}

function actor(role: OrgRole, userId = `user_${role.toLowerCase()}`) {
  return store.createMembership({
    organizationId: "org_a",
    userId,
    role,
    status: "ACTIVE",
  }).then(() => userId);
}

describe("people API role gates", () => {
  beforeEach(() => {
    store.reset();
  });

  it("lets an org admin list people and blocks every other role", async () => {
    const adminId = await actor("ORG_ADMIN");
    const listed = await GET(new NextRequest("http://localhost/api/org/memberships", { headers: headers(adminId) }));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      people: [expect.objectContaining({ userId: adminId, role: "ORG_ADMIN" })],
    });

    for (const role of ["REVIEWER", "CONTRIBUTOR", "VIEWER"] as const) {
      const userId = await actor(role);
      const denied = await GET(new NextRequest("http://localhost/api/org/memberships", { headers: headers(userId) }));
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    }

    const unsigned = await GET(new NextRequest("http://localhost/api/org/memberships"));
    expect(unsigned.status).toBe(401);
  });

  it("lets an org admin invite and blocks a reviewer", async () => {
    const adminId = await actor("ORG_ADMIN");
    const reviewerId = await actor("REVIEWER");
    const denied = await POST(new NextRequest("http://localhost/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers(reviewerId) },
      body: JSON.stringify({ email: "pe@northstar.example", role: "VIEWER" }),
    }));
    expect(denied.status).toBe(403);
    expect(store.users).toHaveLength(0);

    const created = await POST(new NextRequest("http://localhost/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers(adminId) },
      body: JSON.stringify({ email: "pe@northstar.example", role: "CONTRIBUTOR" }),
    }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.membership).toMatchObject({ email: "pe@northstar.example", role: "CONTRIBUTOR", status: "INVITED" });
    expect(body.membership.acceptPath).toContain("/accept?token=");
  });

  it("lets an org admin change a role and blocks a reviewer", async () => {
    const adminId = await actor("ORG_ADMIN");
    const reviewerId = await actor("REVIEWER");
    const member = await store.createMembership({
      organizationId: "org_a",
      userId: "user_pe",
      role: "VIEWER",
      status: "ACTIVE",
    });

    const denied = await PATCH(new NextRequest(`http://localhost/api/org/memberships/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers(reviewerId) },
      body: JSON.stringify({ role: "CONTRIBUTOR" }),
    }), { params: Promise.resolve({ membershipId: member.id }) });
    expect(denied.status).toBe(403);
    expect((await store.findMembershipById(member.id))?.role).toBe("VIEWER");

    const changed = await PATCH(new NextRequest(`http://localhost/api/org/memberships/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers(adminId) },
      body: JSON.stringify({ role: "CONTRIBUTOR" }),
    }), { params: Promise.resolve({ membershipId: member.id }) });
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toMatchObject({ membership: { role: "CONTRIBUTOR" } });

    const demote = await PATCH(new NextRequest(`http://localhost/api/org/memberships/membership_1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers(adminId) },
      body: JSON.stringify({ role: "VIEWER" }),
    }), { params: Promise.resolve({ membershipId: (await store.findMembership(adminId, "org_a"))!.id }) });
    expect(demote.status).toBe(400);
  });

  it("lets an org admin disable and re-enable, and blocks a reviewer", async () => {
    const adminId = await actor("ORG_ADMIN");
    const reviewerId = await actor("REVIEWER");
    store.passwords.add("user_pe");
    const member = await store.createMembership({
      organizationId: "org_a",
      userId: "user_pe",
      role: "REVIEWER",
      status: "ACTIVE",
    });
    const params = { params: Promise.resolve({ membershipId: member.id }) };

    const deniedDisable = await disableMember(new NextRequest(`http://localhost/api/org/memberships/${member.id}/disable`, {
      method: "POST",
      headers: headers(reviewerId),
    }), params);
    expect(deniedDisable.status).toBe(403);

    const disabled = await disableMember(new NextRequest(`http://localhost/api/org/memberships/${member.id}/disable`, {
      method: "POST",
      headers: headers(adminId),
    }), params);
    expect(disabled.status).toBe(200);
    expect((await store.findMembershipById(member.id))?.status).toBe("DISABLED");

    const deniedEnable = await enableMember(new NextRequest(`http://localhost/api/org/memberships/${member.id}/enable`, {
      method: "POST",
      headers: headers(reviewerId),
    }), params);
    expect(deniedEnable.status).toBe(403);

    const enabled = await enableMember(new NextRequest(`http://localhost/api/org/memberships/${member.id}/enable`, {
      method: "POST",
      headers: headers(adminId),
    }), params);
    expect(enabled.status).toBe(200);
    await expect(enabled.json()).resolves.toMatchObject({ membership: { status: "ACTIVE", role: "REVIEWER" } });
  });
});
