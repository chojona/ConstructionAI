import { createPrismaClient } from "../lib/db";
import { seedHeavyJobDemoProject } from "../lib/heavyjob/loadFixtures";

const prisma = createPrismaClient();

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
  await seedHeavyJobDemoProject(prisma, organizationId);
}

main().finally(() => prisma.$disconnect());
