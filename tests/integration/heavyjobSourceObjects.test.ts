import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/projects/[projectId]/heavyjob-objects/route";
import { PrismaMembershipStore } from "@/lib/auth/prismaMembership";
import { hashToken, newSecret, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/sessionToken";
import {
  HEAVYJOB_DEMO_PROJECT_ID,
  HEAVYJOB_FIXTURE_FETCHED_AT,
  HEAVYJOB_OBJECT_TYPES,
  heavyJobFixtures,
} from "@/lib/heavyjob/fixtures";
import { loadHeavyJobFixtures, seedHeavyJobDemoProject } from "@/lib/heavyjob/loadFixtures";
import { PrismaHeavyJobSourceRepository } from "@/lib/heavyjob/repository";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

describe.skipIf(!hasIntegrationDatabase)("HeavyJob source objects", () => {
  const db = integrationDb();
  const repository = new PrismaHeavyJobSourceRepository(db);
  const sessions = new PrismaMembershipStore(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_hj_org_a_${suffix}`;
  const orgB = `it_hj_org_b_${suffix}`;
  const userA = `it_hj_user_a_${suffix}`;
  const userB = `it_hj_user_b_${suffix}`;
  const userInvited = `it_hj_user_invited_${suffix}`;
  const userDisabled = `it_hj_user_disabled_${suffix}`;
  const userIds = [userA, userB, userInvited, userDisabled];
  const sessionTokens = new Map<string, string>();
  let projectId = "";
  let previousTrustHeader: string | undefined;

  function signedIn(userId: string, organizationId: string) {
    return {
      cookie: `${SESSION_COOKIE}=${sessionTokens.get(userId)}`,
      "x-organization-id": organizationId,
    };
  }

  beforeAll(async () => {
    previousTrustHeader = process.env.AUTH_TRUST_USER_HEADER;
    delete process.env.AUTH_TRUST_USER_HEADER;
    await db.organization.createMany({
      data: [
        { id: orgA, name: "HeavyJob Builder A" },
        { id: orgB, name: "HeavyJob Builder B" },
      ],
    });
    await db.user.createMany({
      data: userIds.map((id) => ({ id, email: `${id}@example.com` })),
    });
    await db.orgMembership.createMany({
      data: [
        { organizationId: orgA, userId: userA, role: "VIEWER", status: "ACTIVE" },
        { organizationId: orgB, userId: userB, role: "ORG_ADMIN", status: "ACTIVE" },
        { organizationId: orgA, userId: userInvited, role: "REVIEWER", status: "INVITED" },
        { organizationId: orgA, userId: userDisabled, role: "REVIEWER", status: "DISABLED" },
      ],
    });
    const project = await db.project.create({
      data: { organizationId: orgA, name: "River Road", projectNumber: "NS-214" },
    });
    projectId = project.id;
    for (const userId of userIds) {
      const token = newSecret();
      await sessions.createSession(hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS));
      sessionTokens.set(userId, token);
    }
  });

  afterAll(async () => {
    if (previousTrustHeader === undefined) delete process.env.AUTH_TRUST_USER_HEADER;
    else process.env.AUTH_TRUST_USER_HEADER = previousTrustHeader;
    const projectIds = [projectId, HEAVYJOB_DEMO_PROJECT_ID].filter(Boolean);
    await db.heavyJobSourceObject.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.orgMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
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
        headers: signedIn(userA, orgA),
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

    const crossOrg = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects`, {
        headers: signedIn(userA, orgB),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(crossOrg.status).toBe(403);
    await expect(crossOrg.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });

    const otherOrg = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects`, {
        headers: signedIn(userB, orgB),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(otherOrg.status).toBe(404);

    const unsigned = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects`, {
        headers: { "x-organization-id": orgA },
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(unsigned.status).toBe(401);
    await expect(unsigned.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });

    const forged = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects`, {
        headers: { "x-user-id": userA, "x-organization-id": orgA },
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(forged.status).toBe(401);
    await expect(forged.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });

    for (const userId of [userInvited, userDisabled]) {
      const denied = await GET(
        new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects`, {
          headers: signedIn(userId, orgA),
        }),
        { params: Promise.resolve({ projectId }) },
      );
      expect(denied.status).toBe(403);
    }

    const invalid = await GET(
      new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects?objectType=entitlement`, {
        headers: signedIn(userA, orgA),
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
