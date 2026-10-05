import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaMembershipStore } from "@/lib/auth/prismaMembership";
import { acceptInvitation, loginWithPassword } from "@/lib/auth/login";
import { authorizeRequest } from "@/lib/auth/membership";
import { hashPassword } from "@/lib/auth/password";
import { inviteMember } from "@/lib/auth/people";
import { SESSION_COOKIE } from "@/lib/auth/sessionToken";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

describe.skipIf(!hasIntegrationDatabase)("user login and invite accept", () => {
  const db = integrationDb();
  const store = new PrismaMembershipStore(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_auth_org_a_${suffix}`;
  const orgB = `it_auth_org_b_${suffix}`;
  const adminEmail = `admin-${suffix}@northstar.example`;
  const memberEmail = `pe-${suffix}@northstar.example`;

  beforeAll(async () => {
    await db.organization.createMany({
      data: [
        { id: orgA, name: "Auth Builder A" },
        { id: orgB, name: "Auth Builder B" },
      ],
    });
  });

  afterAll(async () => {
    const users = await db.user.findMany({
      where: { email: { in: [adminEmail, memberEmail] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.orgMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
  });

  it("accepts an invitation for that user and keeps a disabled member out", async () => {
    const admin = await db.user.create({
      data: { email: adminEmail, name: "Ops", passwordHash: await hashPassword("admin-password-1") },
    });
    await db.orgMembership.create({
      data: { organizationId: orgA, userId: admin.id, role: "ORG_ADMIN", status: "ACTIVE" },
    });
    const invited = await inviteMember({
      organizationId: orgA,
      userId: admin.id,
      role: "ORG_ADMIN",
      named: true,
    }, { email: memberEmail, name: "Project Engineer", role: "REVIEWER" }, store);

    await db.user.update({
      where: { id: invited.userId },
      data: { passwordHash: await hashPassword("reviewer-password-1") },
    });
    await expect(loginWithPassword({
      email: memberEmail,
      password: "reviewer-password-1",
    }, store)).rejects.toMatchObject({ message: "Accept the invitation before signing in." });

    const accepted = await acceptInvitation({
      token: invited.acceptToken,
      password: "reviewer-password-1",
      name: "Pat Lee",
    }, store);
    expect(accepted).toMatchObject({ userId: invited.userId, organizationId: orgA, email: memberEmail });
    const membership = await db.orgMembership.findUniqueOrThrow({ where: { id: invited.id } });
    expect(membership.status).toBe("ACTIVE");
    expect(membership.role).toBe("REVIEWER");
    expect(membership.acceptTokenHash).toBeNull();
    await expect(acceptInvitation({
      token: invited.acceptToken,
      password: "reviewer-password-1",
    }, store)).rejects.toMatchObject({ message: "This invitation link is not valid." });

    const request = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: `${SESSION_COOKIE}=${accepted.token}` },
    });
    await expect(authorizeRequest(request, "approve", store, store)).resolves.toMatchObject({
      userId: invited.userId,
      organizationId: orgA,
      role: "REVIEWER",
    });
    await expect(authorizeRequest(request, "manage_people", store, store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const otherOrg = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: `${SESSION_COOKIE}=${accepted.token}`, "x-organization-id": orgB },
    });
    await expect(authorizeRequest(otherOrg, "read", store, store)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authorizeRequest(new NextRequest("http://localhost/api/projects"), "read", store, store)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    await store.setStatus(membership.id, "DISABLED");
    await expect(authorizeRequest(request, "read", store, store)).rejects.toMatchObject({
      message: "This account is disabled for the organization.",
    });
    await expect(loginWithPassword({
      email: memberEmail,
      password: "reviewer-password-1",
    }, store)).rejects.toMatchObject({ message: "This account is disabled for the organization." });
  });
});
