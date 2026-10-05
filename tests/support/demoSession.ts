import { existsSync } from "node:fs";
import { DEMO_USER_EMAIL, DEMO_USER_ID, DEMO_USER_NAME } from "../../lib/auth/demoUser";
import { hashPassword } from "../../lib/auth/password";
import { createPrismaClient } from "../../lib/db";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

/** Fixture password for the seeded demo admin during end-to-end tests. */
export const E2E_DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD?.trim() || "construction-e2e-demo-password";

export async function ensureDemoLogin() {
  const db = createPrismaClient();
  const organizationId = process.env.APP_ORGANIZATION_ID?.trim() || "org_demo";
  const passwordHash = await hashPassword(E2E_DEMO_PASSWORD);
  try {
    await db.organization.upsert({
      where: { id: organizationId },
      update: {},
      create: { id: organizationId, name: "Northstar Construction" },
    });
    const user = await db.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      update: { passwordHash, name: DEMO_USER_NAME },
      create: { id: DEMO_USER_ID, email: DEMO_USER_EMAIL, name: DEMO_USER_NAME, passwordHash },
    });
    await db.orgMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      update: { role: "ORG_ADMIN", status: "ACTIVE" },
      create: { organizationId, userId: user.id, role: "ORG_ADMIN", status: "ACTIVE" },
    });
  } finally {
    await db.$disconnect();
  }
}
