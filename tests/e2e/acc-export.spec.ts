import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { createPrismaClient } from "../../lib/db";
import { PrismaConstructionRepository } from "../../lib/domain/prismaRepository";
import { approvedPacketFixture } from "../support/approvedPacketFixture";
import { deletePacketFixture } from "../support/deletePacketFixture";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const db = createPrismaClient();
let projectId = "";

test.beforeAll(async () => {
  const organizationId = process.env.APP_ORGANIZATION_ID || "org_demo";
  await db.organization.upsert({ where: { id: organizationId }, update: {}, create: { id: organizationId, name: "ACC QA" } });
  const fixture = await approvedPacketFixture(new PrismaConstructionRepository(db), organizationId);
  projectId = fixture.project.id;
});

test.afterAll(async () => {
  if (projectId) await deletePacketFixture(db, projectId);
  await db.$disconnect();
});

test("attaches a PDF on an approved pack", async ({ page, request }) => {
  await page.goto(`/projects/${projectId}?view=changes`);
  const bytes = Buffer.from("%PDF-1.4\nACC RFI fixture\n%%EOF");
  await page.getByLabel("PDF").setInputFiles({ name: "rfi-42.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByLabel("Source id").fill("ACC:RFI:42");
  await page.getByRole("button", { name: "Add pack chapter" }).click();
  await expect(page.getByText("Pack chapter added.")).toBeVisible();
  const response = await request.get(`/api/projects/${projectId}/export`);
  expect(response.ok()).toBe(true);
  const packet = await response.json();
  expect(packet.chapters).toEqual([
    expect.objectContaining({ sourceId: "ACC:RFI:42", filename: "rfi-42.pdf", title: "ACC export" }),
  ]);
  const blocked = await request.get(`/api/projects/${projectId}/export`, {
    headers: { "x-organization-id": "another-organization" },
  });
  expect(blocked.status()).toBe(404);
});
