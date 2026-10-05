import { createPrismaClient } from "../lib/db";
import { DEMO_USER_EMAIL, DEMO_USER_ID, DEMO_USER_NAME } from "../lib/auth/demoUser";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/auth/password";
import { DEMO_REVIEW_ORGANIZATION_ID, seedDemoReviewProject } from "../lib/demo/reviewProject";
import { seedHeavyJobDemoProject } from "../lib/heavyjob/loadFixtures";

const prisma = createPrismaClient();

async function seedDemoAdmin(organizationId: string) {
  const password = process.env.DEMO_USER_PASSWORD?.trim() || "";
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`DEMO_USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const passwordHash = password ? await hashPassword(password) : null;
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: passwordHash ? { passwordHash } : {},
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
  await prisma.orgMembership.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: {},
    create: {
      organizationId,
      userId: user.id,
      role: "ORG_ADMIN",
      status: "ACTIVE",
    },
  });
}

async function main() {
  const organizationId = process.env.APP_ORGANIZATION_ID?.trim() || "org_demo";
  await prisma.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: {
      id: organizationId,
      name: organizationId === "org_demo" ? "Northstar Construction" : "Organization",
    },
  });
  await seedDemoAdmin(organizationId);
  await seedHeavyJobDemoProject(prisma, organizationId);
  if (organizationId === DEMO_REVIEW_ORGANIZATION_ID) await seedDemoReviewProject(prisma);
}

main().finally(() => prisma.$disconnect());
