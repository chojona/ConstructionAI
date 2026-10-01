import type { PrismaClient } from "@prisma/client";
import {
  HEAVYJOB_DEMO_PROJECT_ID,
  HEAVYJOB_DEMO_PROJECT_NAME,
  HEAVYJOB_DEMO_PROJECT_NUMBER,
  heavyJobFixtureInserts,
} from "./fixtures";

export async function loadHeavyJobFixtures(db: PrismaClient, projectId: string) {
  const rows = heavyJobFixtureInserts(projectId);
  await db.heavyJobSourceObject.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

export async function seedHeavyJobDemoProject(db: PrismaClient, organizationId: string) {
  await db.project.upsert({
    where: { id: HEAVYJOB_DEMO_PROJECT_ID },
    update: {
      organizationId,
      name: HEAVYJOB_DEMO_PROJECT_NAME,
      projectNumber: HEAVYJOB_DEMO_PROJECT_NUMBER,
    },
    create: {
      id: HEAVYJOB_DEMO_PROJECT_ID,
      organizationId,
      name: HEAVYJOB_DEMO_PROJECT_NAME,
      projectNumber: HEAVYJOB_DEMO_PROJECT_NUMBER,
    },
  });
  return loadHeavyJobFixtures(db, HEAVYJOB_DEMO_PROJECT_ID);
}
