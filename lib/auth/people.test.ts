import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import type { OrgAccess } from "./membership";
import { authorizeRequest } from "./membership";
import { disableMember, inviteMember, listPeople, type InvitedMember } from "./people";
import type { MembershipRecord, OrgRole, PeopleStore, PersonMembership, PersonRecord } from "./roles";

function access(role: OrgRole, organizationId = "org_a"): OrgAccess {
  return { organizationId, userId: `user_${role.toLowerCase()}`, role, named: true };
}

class MemoryPeople implements PeopleStore {
  users: PersonRecord[] = [];
  memberships: MembershipRecord[] = [];
  private sequence = 0;

  async findMembership(userId: string, organizationId: string) {
    return this.memberships.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null;
  }

  async listActiveMemberships(userId: string) {
    return this.memberships.filter((row) => row.userId === userId && row.status === "ACTIVE");
  }

  async listMembershipsForUser(userId: string) {
    return this.memberships.filter((row) => row.userId === userId);
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

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.memberships.filter((row) =>
      row.organizationId === organizationId && row.role === role && row.status === "ACTIVE").length;
  }

  acceptTokens: { membershipId: string; tokenHash: string; expiresAt: Date }[] = [];

  async saveAcceptToken(membershipId: string, tokenHash: string, expiresAt: Date) {
    this.acceptTokens.push({ membershipId, tokenHash, expiresAt });
  }

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
      };
    });
  }
}

describe("invite and disable", () => {
  it("rejects roles outside the locked V0 set", async () => {
    const store = new MemoryPeople();
    await expect(inviteMember(access("ORG_ADMIN"), {
      email: "pe@northstar.example",
      role: "DSC",
    }, store)).rejects.toBeInstanceOf(ZodError);
  });

  it("lets an org admin invite a person and keeps a Reviewer from doing it", async () => {
    const store = new MemoryPeople();
    await expect(inviteMember(access("REVIEWER"), {
      email: "pe@northstar.example",
      role: "CONTRIBUTOR",
    }, store)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const invited = await inviteMember(access("ORG_ADMIN"), {
      email: "New.Person@Example.com",
      name: "New Person",
      role: "CONTRIBUTOR",
    }, store);
    expect(invited).toMatchObject({
      email: "new.person@example.com",
      name: "New Person",
      role: "CONTRIBUTOR",
      status: "INVITED",
      organizationId: "org_a",
    });
    expect(invited.acceptToken.length).toBeGreaterThan(20);
    expect(invited.acceptPath).toContain(encodeURIComponent(invited.acceptToken));
    expect(store.acceptTokens).toHaveLength(1);
    await expect(authorizeRequest(new NextRequest("http://localhost/api/projects", {
      headers: { "x-user-id": invited.userId, "x-organization-id": "org_a" },
    }), "read", store)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not put one person in a second organization yet", async () => {
    const store = new MemoryPeople();
    await inviteMember(access("ORG_ADMIN"), { email: "pe@northstar.example", role: "VIEWER" }, store);
    await expect(inviteMember(access("ORG_ADMIN", "org_b"), {
      email: "pe@northstar.example",
      role: "VIEWER",
    }, store)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "A person can belong to one organization for now.",
    });
  });

  it("lists only the actor's organization", async () => {
    const store = new MemoryPeople();
    await inviteMember(access("ORG_ADMIN"), { email: "a@northstar.example", role: "VIEWER" }, store);
    await inviteMember(access("ORG_ADMIN", "org_b"), { email: "b@other.example", role: "VIEWER" }, store);
    const people = await listPeople(access("ORG_ADMIN"), store);
    expect(people.map((person) => person.email)).toEqual(["a@northstar.example"]);
  });

  it("denies a disabled member and keeps the last org admin", async () => {
    const store = new MemoryPeople();
    const admin = await store.createUser({ email: "lead@northstar.example", name: "Lead" });
    const adminMembership = await store.createMembership({
      organizationId: "org_a",
      userId: admin.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    });
    const reviewer = await store.createUser({ email: "pe@northstar.example", name: "PE" });
    const reviewerMembership = await store.createMembership({
      organizationId: "org_a",
      userId: reviewer.id,
      role: "REVIEWER",
      status: "ACTIVE",
    });

    await expect(disableMember(access("REVIEWER"), reviewerMembership.id, store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(disableMember(access("ORG_ADMIN"), adminMembership.id, store)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The organization needs an active org admin.",
    });
    expect((await store.findMembershipById(adminMembership.id))?.status).toBe("ACTIVE");

    const otherAdmin = await store.createUser({ email: "ops@northstar.example", name: "Ops" });
    await store.createMembership({
      organizationId: "org_a",
      userId: otherAdmin.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    });
    const disabled: InvitedMember["status"] = (await disableMember(access("ORG_ADMIN"), reviewerMembership.id, store)).status;
    expect(disabled).toBe("DISABLED");
    await expect(authorizeRequest(new NextRequest("http://localhost/api/projects", {
      headers: { "x-user-id": reviewer.id, "x-organization-id": "org_a" },
    }), "read", store)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This account is disabled for the organization.",
    });
  });

  it("does not disable a membership from another organization", async () => {
    const store = new MemoryPeople();
    const user = await store.createUser({ email: "pe@other.example", name: null });
    const membership = await store.createMembership({
      organizationId: "org_b",
      userId: user.id,
      role: "VIEWER",
      status: "ACTIVE",
    });
    await expect(disableMember(access("ORG_ADMIN"), membership.id, store)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
