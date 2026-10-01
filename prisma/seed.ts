import { createPrismaClient } from "../lib/db";

const prisma = createPrismaClient();

async function main() {
  await prisma.organization.upsert({
    where: { id: "org_demo" },
    update: {},
    create: { id: "org_demo", name: "Northstar Construction" },
  });
}

main().finally(() => prisma.$disconnect());
