import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import type { OrgAccess } from "./membership";
import { authorizeRequest } from "./membership";
import { applyOrgAdminRelease, createReleaseQueue } from "./orgAdminRelease";
import { changeMemberRole, disableMember, enableMember, inviteMember, listPeople, type InvitedMember } from "./people";
import type { MembershipRecord, OrgAdminRelease, OrgRole, PeopleStore, PersonMembership, PersonRecord, ReviewerDirectoryEntry } from "./roles";

function access(role: OrgRole, organizationId = "org_a"): OrgAccess {
  return { organizationId, userId: `user_${role.toLowerCase()}`, role, named: true };
}

class MemoryPeople implements PeopleStore {
  users: PersonRecord[] = [];
  memberships: MembershipRecord[] = [];
  private sequence = 0;
  private updatedAt = new Map<string, Date>();
  private exclusive = createReleaseQueue();

  private touch(id: string) {
    this.updatedAt.set(id, new Date());
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
    this.touch(row.id);
    return row;
  }

  async findMembershipById(id: string) {
    return this.memberships.find((row) => row.id === id) ?? null;
  }

  async setStatus(id: string, status: MembershipRecord["status"]) {
    const row = this.memberships.find((item) => item.id === id);
    if (!row) throw new Error(`missing ${id}`);
    row.status = status;
    this.touch(id);
    return row;
  }

  async setRole(id: string, role: OrgRole) {
    const row = this.memberships.find((item) => item.id === id);
    if (!row) throw new Error(`missing ${id}`);
    row.role = role;
    this.touch(id);
    return row;
  }

  releaseOrgAdmin(id: string, change: OrgAdminRelease) {
    return this.exclusive(() => {
      const result = applyOrgAdminRelease(this.memberships, id, change);
      if (result.outcome === "updated") this.touch(id);
      return result;
    });
  }

  async acceptPending(id: string) {
    return this.acceptTokens.some((token) => token.membershipId === id);
  }

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.memberships.filter((row) =>
      row.organizationId === organizationId && row.role === role && row.status === "ACTIVE").length;
  }

  acceptTokens: { membershipId: string; tokenHash: string; expiresAt: Date }[] = [];

  async saveAcceptToken(membershipId: string, tokenHash: string, expiresAt: Date) {
    this.acceptTokens.push({ membershipId, tokenHash, expiresAt });
  }

  async listReviewerDirectory(organizationId: string): Promise<ReviewerDirectoryEntry[]> {
    return this.memberships.filter((row) => row.organizationId === organizationId).map((row) => ({
      userId: row.userId,
      name: this.users.find((user) => user.id === row.userId)?.name ?? null,
      status: row.status,
    }));
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
        updatedAt: this.updatedAt.get(row.id) ?? new Date(0),
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
    expect(people[0]?.updatedAt).toBeInstanceOf(Date);
    await expect(listPeople(access("VIEWER"), store)).rejects.toMatchObject({ code: "FORBIDDEN" });
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

  it("changes role on the next request and keeps the last org admin", async () => {
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

    await expect(changeMemberRole(access("REVIEWER"), reviewerMembership.id, { role: "VIEWER" }, store)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(changeMemberRole(access("ORG_ADMIN"), reviewerMembership.id, { role: "DSC" }, store)).rejects.toBeInstanceOf(ZodError);
    await expect(changeMemberRole(access("ORG_ADMIN"), adminMembership.id, { role: "VIEWER" }, store)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The organization needs an active org admin.",
    });
    expect((await store.findMembershipById(adminMembership.id))?.role).toBe("ORG_ADMIN");

    const changed = await changeMemberRole(access("ORG_ADMIN"), reviewerMembership.id, { role: "CONTRIBUTOR" }, store);
    expect(changed).toMatchObject({ role: "CONTRIBUTOR", status: "ACTIVE" });
    const request = new NextRequest("http://localhost/api/projects", {
      headers: { "x-user-id": reviewer.id, "x-organization-id": "org_a" },
    });
    await expect(authorizeRequest(request, "upload", store)).resolves.toMatchObject({ role: "CONTRIBUTOR" });
    await expect(authorizeRequest(request, "approve", store)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("re-enables a disabled member with the same role and restores access", async () => {
    const store = new MemoryPeople();
    const admin = await store.createUser({ email: "lead@northstar.example", name: "Lead" });
    await store.createMembership({
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

    await disableMember(access("ORG_ADMIN"), reviewerMembership.id, store);
    const request = new NextRequest("http://localhost/api/projects", {
      headers: { "x-user-id": reviewer.id, "x-organization-id": "org_a" },
    });
    await expect(authorizeRequest(request, "read", store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(enableMember(access("CONTRIBUTOR"), reviewerMembership.id, store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(changeMemberRole(access("ORG_ADMIN"), reviewerMembership.id, { role: "VIEWER" }, store)).rejects.toMatchObject({
      message: "Re-enable this person before changing their role.",
    });

    const enabled = await enableMember(access("ORG_ADMIN"), reviewerMembership.id, store);
    expect(enabled).toMatchObject({ status: "ACTIVE", role: "REVIEWER" });
    await expect(authorizeRequest(request, "approve", store)).resolves.toMatchObject({ role: "REVIEWER" });
    await expect(enableMember(access("ORG_ADMIN"), reviewerMembership.id, store)).rejects.toMatchObject({
      message: "That person is not disabled.",
    });
  });

  it("returns a disabled invitation to invited and does not grant access", async () => {
    const store = new MemoryPeople();
    const invited = await inviteMember(access("ORG_ADMIN"), {
      email: "pe@northstar.example",
      role: "CONTRIBUTOR",
    }, store);
    await disableMember(access("ORG_ADMIN"), invited.id, store);
    const enabled = await enableMember(access("ORG_ADMIN"), invited.id, store);
    expect(enabled).toMatchObject({ status: "INVITED", role: "CONTRIBUTOR" });
    await expect(authorizeRequest(new NextRequest("http://localhost/api/projects", {
      headers: { "x-user-id": invited.userId, "x-organization-id": "org_a" },
    }), "read", store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(enableMember(access("ORG_ADMIN"), "membership_missing", store)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a duplicate invite that loses the email unique constraint", async () => {
    const store = new MemoryPeople();
    const original = store.createUser.bind(store);
    let created = 0;
    store.createUser = async (input) => {
      created += 1;
      if (created > 1) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "7.10.0",
          meta: { target: ["email"] },
        });
      }
      return original(input);
    };
    await inviteMember(access("ORG_ADMIN"), { email: "pe@northstar.example", role: "VIEWER" }, store);
    store.users.length = 0;
    await expect(inviteMember(access("ORG_ADMIN"), { email: "pe@northstar.example", role: "VIEWER" }, store)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      httpStatus: 409,
      message: "That person already belongs to this organization.",
    });
  });

  async function twoAdmins() {
    const store = new MemoryPeople();
    const first = await store.createUser({ email: "lead@northstar.example", name: "Lead" });
    const firstMembership = await store.createMembership({
      organizationId: "org_a",
      userId: first.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    });
    const second = await store.createUser({ email: "ops@northstar.example", name: "Ops" });
    const secondMembership = await store.createMembership({
      organizationId: "org_a",
      userId: second.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    });
    return { store, firstMembership, secondMembership };
  }

  it("lets one of two admins be disabled or demoted and rejects the overlapping loser", async () => {
    const disabled = await twoAdmins();
    const disableResults = await Promise.allSettled([
      disableMember(access("ORG_ADMIN"), disabled.firstMembership.id, disabled.store),
      disableMember(access("ORG_ADMIN"), disabled.secondMembership.id, disabled.store),
    ]);
    expect(disableResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const disableLoser = disableResults.find((result) => result.status === "rejected");
    expect(disableLoser?.status === "rejected" && disableLoser.reason).toMatchObject({
      code: "INVALID_INPUT",
      message: "The organization needs an active org admin.",
    });
    expect(await disabled.store.countActiveRole("org_a", "ORG_ADMIN")).toBeGreaterThanOrEqual(1);

    const demoted = await twoAdmins();
    const demoteResults = await Promise.allSettled([
      changeMemberRole(access("ORG_ADMIN"), demoted.firstMembership.id, { role: "REVIEWER" }, demoted.store),
      changeMemberRole(access("ORG_ADMIN"), demoted.secondMembership.id, { role: "VIEWER" }, demoted.store),
    ]);
    expect(demoteResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const demoteLoser = demoteResults.find((result) => result.status === "rejected");
    expect(demoteLoser?.status === "rejected" && demoteLoser.reason).toMatchObject({
      code: "INVALID_INPUT",
      message: "The organization needs an active org admin.",
    });
    expect(await demoted.store.countActiveRole("org_a", "ORG_ADMIN")).toBeGreaterThanOrEqual(1);

    const kept = demoted.store.memberships.find((row) => row.role === "ORG_ADMIN" && row.status === "ACTIVE");
    const dropped = demoted.store.memberships.find((row) => row.id !== kept?.id);
    expect(dropped?.role).not.toBe("ORG_ADMIN");
    if (dropped?.status === "ACTIVE") {
      const restored = await changeMemberRole(access("ORG_ADMIN"), dropped.id, { role: "ORG_ADMIN" }, demoted.store);
      expect(restored.role).toBe("ORG_ADMIN");
      const again = await changeMemberRole(access("ORG_ADMIN"), dropped.id, { role: "CONTRIBUTOR" }, demoted.store);
      expect(again.role).toBe("CONTRIBUTOR");
    }
  });
});
