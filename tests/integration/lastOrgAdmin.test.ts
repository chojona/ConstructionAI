import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaMembershipStore } from "@/lib/auth/prismaMembership";
import { changeMemberRole, disableMember } from "@/lib/auth/people";
import type { OrgAccess } from "@/lib/auth/membership";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

describe.skipIf(!hasIntegrationDatabase)("last org admin release", () => {
  const db = integrationDb();
  const store = new PrismaMembershipStore(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const organizationId = `it_admin_lock_${suffix}`;

  beforeAll(async () => {
    await db.organization.create({ data: { id: organizationId, name: "Admin lock" } });
  });

  afterAll(async () => {
    await db.orgMembership.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { email: { endsWith: `${suffix}@northstar.example` } } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.$disconnect();
  });

  it("rejects the loser when two admins are disabled or demoted together", async () => {
    const first = await store.createUser({ email: `lead-${suffix}@northstar.example`, name: "Lead" });
    const second = await store.createUser({ email: `ops-${suffix}@northstar.example`, name: "Ops" });
    const firstMembership = await store.createMembership({
      organizationId,
      userId: first.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    });
    const secondMembership = await store.createMembership({
      organizationId,
      userId: second.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    });
    const actor: OrgAccess = { organizationId, userId: first.id, role: "ORG_ADMIN", named: true };

    const disabled = await Promise.allSettled([
      disableMember(actor, firstMembership.id, store),
      disableMember(actor, secondMembership.id, store),
    ]);
    expect(disabled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(disabled.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "INVALID_INPUT", message: "The organization needs an active org admin." },
    });
    expect(await store.countActiveRole(organizationId, "ORG_ADMIN")).toBe(1);

    await db.orgMembership.updateMany({
      where: { organizationId },
      data: { role: "ORG_ADMIN", status: "ACTIVE" },
    });
    const demoted = await Promise.allSettled([
      changeMemberRole(actor, firstMembership.id, { role: "REVIEWER" }, store),
      changeMemberRole(actor, secondMembership.id, { role: "VIEWER" }, store),
    ]);
    expect(demoted.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(demoted.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "INVALID_INPUT", message: "The organization needs an active org admin." },
    });
    expect(await store.countActiveRole(organizationId, "ORG_ADMIN")).toBe(1);
  });
});
