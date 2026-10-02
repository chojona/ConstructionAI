import { createPrismaClient } from "../lib/db";
import { DEMO_USER_EMAIL, DEMO_USER_ID, DEMO_USER_NAME } from "../lib/auth/demoUser";
import { DEMO_REVIEW_ORGANIZATION_ID, seedDemoReviewProject } from "../lib/demo/reviewProject";
import { seedHeavyJobDemoProject } from "../lib/heavyjob/loadFixtures";

const prisma = createPrismaClient();

async function seedDemoAdmin(organizationId: string) {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
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
