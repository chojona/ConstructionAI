import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/projects/[projectId]/heavyjob-objects/route";
import { createPrismaClient } from "@/lib/db";
import {
  HEAVYJOB_DEMO_PROJECT_ID,
  HEAVYJOB_FIXTURE_FETCHED_AT,
  HEAVYJOB_OBJECT_TYPES,
  heavyJobFixtures,
} from "@/lib/heavyjob/fixtures";
import { loadHeavyJobFixtures, seedHeavyJobDemoProject } from "@/lib/heavyjob/loadFixtures";
import { PrismaHeavyJobSourceRepository } from "@/lib/heavyjob/repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");

describe("HeavyJob source objects", () => {
  const db = createPrismaClient();
  const repository = new PrismaHeavyJobSourceRepository(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_hj_org_a_${suffix}`;
  const orgB = `it_hj_org_b_${suffix}`;
  let projectId = "";

  beforeAll(async () => {
    await db.organization.createMany({
      data: [
        { id: orgA, name: "HeavyJob Builder A" },
        { id: orgB, name: "HeavyJob Builder B" },
      ],
    });
    const project = await db.project.create({
      data: { organizationId: orgA, name: "River Road", projectNumber: "NS-214" },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const projectIds = [projectId, HEAVYJOB_DEMO_PROJECT_ID].filter(Boolean);
    await db.heavyJobSourceObject.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
  });

  it("loads fixture snapshots with provenance and lists them for the project", async () => {
    const before = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(await loadHeavyJobFixtures(db, projectId)).toBe(heavyJobFixtures.length);
    expect(await loadHeavyJobFixtures(db, projectId)).toBe(heavyJobFixtures.length);

    const stored = await db.heavyJobSourceObject.findMany({ where: { projectId } });
    expect(stored).toHaveLength(heavyJobFixtures.length);
    const after = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(after).toMatchObject({ name: before.name, projectNumber: before.projectNumber, organizationId: before.organizationId });

    const objects = await repository.listForProject(orgA, projectId);
    expect(objects).not.toBeNull();
    expect(new Set(objects!.map((object) => object.objectType))).toEqual(new Set(HEAVYJOB_OBJECT_TYPES));
    for (const object of objects!) {
      expect(object.projectId).toBe(projectId);
      expect(object.sourceId.length).toBeGreaterThan(0);
      expect(object.fetchedAt.toISOString()).toBe(HEAVYJOB_FIXTURE_FETCHED_AT);
      expect(object.raw).toEqual(expect.any(Object));
    }

    const timecard = objects!.find((object) => object.objectType === "timecard");
    const raw = timecard?.raw as { costCodes?: Array<{ isTm?: unknown; isRework?: unknown }> };
    expect(raw.costCodes?.some((line) => line.isTm === true && line.isRework === false)).toBe(true);
    expect(raw.costCodes?.some((line) => line.isRework === true && line.isTm === false)).toBe(true);

    expect(await repository.listForProject(orgA, projectId, "diary")).toHaveLength(
      heavyJobFixtures.filter((fixture) => fixture.objectType === "diary").length,
    );
    expect(await repository.listForProject(orgB, projectId)).toBeNull();

    const timecardRow = await db.heavyJobSourceObject.findFirstOrThrow({
      where: { projectId, objectType: "timecard" },
    });
    await db.heavyJobSourceObject.update({
      where: { id: timecardRow.id },
      data: { raw: { id: timecardRow.sourceId, marker: "kept" } },
    });
    await loadHeavyJobFixtures(db, projectId);
    const reread = await db.heavyJobSourceObject.findUniqueOrThrow({ where: { id: timecardRow.id } });
    expect(reread.raw).toMatchObject({ marker: "kept" });
    expect(await db.heavyJobSourceObject.count({ where: { projectId, sourceId: timecardRow.sourceId } })).toBe(1);
  });

  it("serves the project snapshots from the read API", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects?objectType=quantity`, {
        headers: { "x-organization-id": orgA },
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      objects: Array<{ objectType: string; sourceId: string; fetchedAt: string; raw: { installedQuantity?: number; consumedQuantity?: number } }>;
    };
    expect(body.objects).toHaveLength(heavyJobFixtures.filter((fixture) => fixture.objectType === "quantity").length);
    expect(body.objects[0]).toMatchObject({
      objectType: "quantity",
      projectId,
      fetchedAt: HEAVYJOB_FIXTURE_FETCHED_AT,
    });
    expect(body.objects.every((object) => object.sourceId.length > 0)).toBe(true);
    expect(body.objects.every((object) => typeof object.raw.installedQuantity === "number")).toBe(true);
    expect(body.objects.every((object) => typeof object.raw.consumedQuantity === "number")).toBe(true);

    const hidden = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects`, {
        headers: { "x-organization-id": orgB },
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(hidden.status).toBe(404);

    const invalid = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects?objectType=entitlement`, {
        headers: { "x-organization-id": orgA },
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(invalid.status).toBe(400);
  });

  it("seeds the demo project used by prisma/seed.ts", async () => {
    expect(await seedHeavyJobDemoProject(db, orgA)).toBe(heavyJobFixtures.length);
    const project = await db.project.findUniqueOrThrow({ where: { id: HEAVYJOB_DEMO_PROJECT_ID } });
    expect(project.organizationId).toBe(orgA);
    const objects = await repository.listForProject(orgA, HEAVYJOB_DEMO_PROJECT_ID);
    expect(objects).toHaveLength(heavyJobFixtures.length);
    expect(objects!.every((object) => object.sourceId && object.fetchedAt && object.raw)).toBe(true);
  });
});
