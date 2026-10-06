import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { CredentialStore, CredentialUser, InviteRecord } from "./credentials";
import { acceptInvitation, endSession, loginWithPassword } from "./login";
import { hashPassword } from "./password";
import { authorizeRequest, type OrgAccess } from "./membership";
import { disableMember, enableMember, inviteMember, refreshAcceptToken } from "./people";
import { hashToken, SESSION_COOKIE } from "./sessionToken";
import type { MembershipRecord, OrgRole, PeopleStore, PersonMembership, PersonRecord } from "./roles";

class MemoryAuth implements PeopleStore, CredentialStore {
  users: CredentialUser[] = [];
  memberships: MembershipRecord[] = [];
  private invites = new Map<string, { membershipId: string; expiresAt: Date }>();
  private sessions = new Map<string, { userId: string; expiresAt: Date }>();
  private updatedAt = new Map<string, Date>();
  private sequence = 0;

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

  async findUserByEmail(email: string): Promise<PersonRecord | null> {
    const user = this.users.find((item) => item.email === email);
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  }

  async findUserCredential(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createUser(input: { email: string; name: string | null }) {
    const user = { id: `user_${++this.sequence}`, email: input.email, name: input.name, passwordHash: null };
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

  async acceptPending(id: string) {
    for (const invite of this.invites.values()) {
      if (invite.membershipId === id) return true;
    }
    return false;
  }

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.memberships.filter((row) =>
      row.organizationId === organizationId && row.role === role && row.status === "ACTIVE").length;
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

  async saveAcceptToken(membershipId: string, tokenHash: string, expiresAt: Date) {
    for (const [hash, invite] of this.invites) {
      if (invite.membershipId === membershipId) this.invites.delete(hash);
    }
    this.invites.set(tokenHash, { membershipId, expiresAt });
  }

  async setPasswordHash(userId: string, passwordHash: string, name?: string | null) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error(`missing ${userId}`);
    user.passwordHash = passwordHash;
    if (name !== undefined) user.name = name;
  }

  async findInvite(tokenHash: string): Promise<InviteRecord | null> {
    const invite = this.invites.get(tokenHash);
    if (!invite) return null;
    const membership = this.memberships.find((row) => row.id === invite.membershipId);
    const user = this.users.find((item) => item.id === membership?.userId);
    if (!membership || !user) return null;
    return {
      membership,
      email: user.email,
      name: user.name,
      organizationName: membership.organizationId,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(membershipId: string) {
    const membership = this.memberships.find((row) => row.id === membershipId);
    if (!membership) throw new Error(`missing ${membershipId}`);
    membership.status = "ACTIVE";
    for (const [hash, invite] of this.invites) {
      if (invite.membershipId === membershipId) this.invites.delete(hash);
    }
    return membership;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async findValidSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return { userId: session.userId };
  }

  sessionCount() {
    return this.sessions.size;
  }
}

function admin(organizationId = "org_a"): OrgAccess {
  return { organizationId, userId: "user_admin", role: "ORG_ADMIN", named: true };
}

describe("login and invite accept", () => {
  it("turns the invited user active and signs that user in", async () => {
    const store = new MemoryAuth();
    const invited = await inviteMember(admin(), {
      email: "pe@northstar.example",
      name: "Project Engineer",
      role: "CONTRIBUTOR",
    }, store);
    expect(invited.status).toBe("INVITED");

    await expect(loginWithPassword({
      email: "pe@northstar.example",
      password: "correct-horse-1",
    }, store)).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Email or password is incorrect." });

    const accepted = await acceptInvitation({
      token: invited.acceptToken,
      password: "correct-horse-1",
      name: "Pat Lee",
    }, store);
    expect(accepted).toMatchObject({
      userId: invited.userId,
      email: "pe@northstar.example",
      name: "Pat Lee",
      organizationId: "org_a",
    });
    expect((await store.findMembershipById(invited.id))?.status).toBe("ACTIVE");
    expect((await store.findMembershipById(invited.id))?.role).toBe("CONTRIBUTOR");

    await expect(acceptInvitation({
      token: invited.acceptToken,
      password: "correct-horse-1",
    }, store)).rejects.toMatchObject({ message: "This invitation link is not valid." });

    const request = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: `${SESSION_COOKIE}=${accepted.token}` },
    });
    await expect(authorizeRequest(request, "upload", store, store)).resolves.toMatchObject({
      userId: invited.userId,
      organizationId: "org_a",
      role: "CONTRIBUTOR",
      named: true,
    });
    await expect(authorizeRequest(request, "approve", store, store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const otherOrg = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: `${SESSION_COOKIE}=${accepted.token}`, "x-organization-id": "org_b" },
    });
    await expect(authorizeRequest(otherOrg, "read", store, store)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await endSession(accepted.token, store);
    await expect(authorizeRequest(request, "read", store, store)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("keeps a disabled member from signing in or accepting", async () => {
    const store = new MemoryAuth();
    const user = await store.createUser({ email: "off@northstar.example", name: "Off" });
    await store.setPasswordHash(user.id, await hashPassword("correct-horse-1"));
    const membership = await store.createMembership({
      organizationId: "org_a",
      userId: user.id,
      role: "REVIEWER",
      status: "DISABLED",
    });
    await store.saveAcceptToken(membership.id, hashToken("invite-token-disabled-member"), new Date(Date.now() + 60_000));

    await expect(loginWithPassword({
      email: "off@northstar.example",
      password: "correct-horse-1",
    }, store)).rejects.toMatchObject({ message: "This account is disabled for the organization." });
    expect(store.sessionCount()).toBe(0);
    await expect(acceptInvitation({
      token: "invite-token-disabled-member",
      password: "another-password-1",
    }, store)).rejects.toMatchObject({ message: "This account is disabled for the organization." });
    expect((await store.findMembershipById(membership.id))?.status).toBe("DISABLED");
  });

  it("rejects an expired accept link and a replaced one", async () => {
    const store = new MemoryAuth();
    const invited = await inviteMember(admin(), { email: "new@northstar.example", role: "VIEWER" }, store);
    const stale = invited.acceptToken;
    await store.saveAcceptToken(invited.id, hashToken(stale), new Date(Date.now() - 1000));
    await expect(acceptInvitation({ token: stale, password: "correct-horse-1" }, store)).rejects.toMatchObject({
      message: "This invitation link is not valid.",
    });

    const issued = await refreshAcceptToken(admin(), invited.id, store);
    await expect(refreshAcceptToken({ ...admin(), role: "REVIEWER" }, invited.id, store)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const accepted = await acceptInvitation({ token: issued.acceptToken, password: "correct-horse-1" }, store);
    expect(accepted.userId).toBe(invited.userId);
    expect((await store.findMembershipById(invited.id))?.role).toBe("VIEWER");
    await expect(acceptInvitation({ token: stale, password: "correct-horse-1" }, store)).rejects.toMatchObject({
      message: "This invitation link is not valid.",
    });
  });

  it("does not sign in an invited member who already has a password", async () => {
    const store = new MemoryAuth();
    const invited = await inviteMember(admin(), { email: "pe@northstar.example", role: "REVIEWER" }, store);
    await store.setPasswordHash(invited.userId, await hashPassword("correct-horse-1"));
    await expect(loginWithPassword({
      email: "pe@northstar.example",
      password: "correct-horse-1",
    }, store)).rejects.toMatchObject({ message: "Accept the invitation before signing in." });
    expect((await store.findMembershipById(invited.id))?.status).toBe("INVITED");
    expect(store.sessionCount()).toBe(0);
  });

  it("uses the same error for an unknown email and a wrong password", async () => {
    const store = new MemoryAuth();
    const invited = await inviteMember(admin(), { email: "pe@northstar.example", role: "ORG_ADMIN" }, store);
    await acceptInvitation({ token: invited.acceptToken, password: "correct-horse-1" }, store);
    await expect(loginWithPassword({
      email: "pe@northstar.example",
      password: "wrong-password-1",
    }, store)).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Email or password is incorrect." });
    await expect(loginWithPassword({
      email: "missing@northstar.example",
      password: "wrong-password-1",
    }, store)).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Email or password is incorrect." });
  });

  it("restores the prior role and sign-in after re-enable", async () => {
    const store = new MemoryAuth();
    const invited = await inviteMember(admin(), { email: "pe@northstar.example", role: "REVIEWER" }, store);
    const accepted = await acceptInvitation({
      token: invited.acceptToken,
      password: "correct-horse-1",
      name: "Pat Lee",
    }, store);
    await endSession(accepted.token, store);
    await disableMember(admin(), invited.id, store);
    await expect(loginWithPassword({
      email: "pe@northstar.example",
      password: "correct-horse-1",
    }, store)).rejects.toMatchObject({ message: "This account is disabled for the organization." });

    const enabled = await enableMember(admin(), invited.id, store);
    expect(enabled).toMatchObject({ status: "ACTIVE", role: "REVIEWER" });
    const signedIn = await loginWithPassword({
      email: "pe@northstar.example",
      password: "correct-horse-1",
    }, store);
    const request = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: `${SESSION_COOKIE}=${signedIn.token}` },
    });
    await expect(authorizeRequest(request, "approve", store, store)).resolves.toMatchObject({
      userId: invited.userId,
      role: "REVIEWER",
    });
  });
});
