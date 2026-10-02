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

test("PE attaches an ACC PDF in the approved pack flow and downloads the original chapter", async ({ page, request }) => {
  await page.goto(`/projects/${projectId}?view=changes`);
  await page.getByRole("button", { name: "Attach ACC PDF" }).click();
  const form = page.getByRole("region", { name: "Attach ACC PDF chapter" });
  await form.getByLabel("ACC source ID").fill("ACC:RFI:42");
  const bytes = Buffer.from("%PDF-1.4\nACC RFI fixture\n%%EOF");
  await form.getByLabel("ACC PDF").setInputFiles({ name: "rfi-42.pdf", mimeType: "application/pdf", buffer: bytes });
  await form.getByRole("button", { name: "Include in approved pack" }).click();
  await expect(form.getByText("ACC PDF included in approved pack.")).toBeVisible();
  const packUrl = await form.getByRole("link", { name: "Download pack with ACC PDFs" }).getAttribute("href");
  const response = await request.get(packUrl!);
  expect(response.ok()).toBe(true);
  const packet = await response.json();
  expect(packet.chapters).toEqual([expect.objectContaining({ source: "ACC", sourceId: "ACC:RFI:42", filename: "rfi-42.pdf" })]);
  expect(packet.chapters[0].decisionId).toBe(packet.decisionIds[0]);
  const pdfUrl = await form.getByRole("link", { name: "Download rfi-42.pdf" }).getAttribute("href");
  const pdf = await request.get(pdfUrl!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(await pdf.body()).toEqual(bytes);
  const blocked = await request.get(pdfUrl!, { headers: { "x-organization-id": "another-organization" } });
  expect(blocked.status()).toBe(404);
});
