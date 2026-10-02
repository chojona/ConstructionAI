import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { buildTextPdf } from "../../lib/documents/minimalPdf";
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
  const chapter = page.getByRole("form", { name: "Pack chapter" });
  await chapter.getByRole("button", { name: "File: PDF", exact: true }).setInputFiles({ name: "rfi-42.pdf", mimeType: "application/pdf", buffer: bytes });
  await chapter.getByLabel("Source id").fill("ACC:RFI:42");
  await chapter.getByRole("button", { name: "Add pack chapter" }).click();
  await expect(page.getByText("Pack chapter added.")).toBeVisible();
  const chapterProof = chapter.locator(".packet-proof");
  await expect(chapterProof.getByText("ACC:RFI:42")).toBeVisible();
  await expect(chapterProof.getByText("Source id")).toBeVisible();
  await expect(chapterProof.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(chapterProof.getByText("Fetched")).toBeVisible();
  await expect(chapterProof.getByText("sha256")).toBeVisible();
  await expect(chapterProof.getByText(/^[a-f0-9]{12}$/).first()).toBeVisible();
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

test("attaches a markup summary on an approved pack", async ({ page, request }) => {
  await page.goto(`/projects/${projectId}?view=changes`);
  const bytes = buildTextPdf(["Markup Summary", "Page: 2", "Page: 14"]);
  const appendix = page.getByRole("form", { name: "Pack appendix" });
  await expect(appendix.getByLabel("File: PDF")).toBeVisible();
  await expect(appendix.getByRole("button", { name: "Add pack appendix" })).toBeVisible();
  await expect(appendix.getByLabel("Bluebeam Markup Summary")).toBeVisible();
  await appendix.getByLabel("File: PDF").setInputFiles({ name: "markup-summary.pdf", mimeType: "application/pdf", buffer: bytes });
  await appendix.getByLabel("Source id").fill("bb-summary-17");
  await appendix.getByRole("button", { name: "Add pack appendix" }).click();
  await expect(page.getByText("Pack appendix added.")).toBeVisible();
  const proof = appendix.locator(".packet-proof");
  await expect(proof.getByText("Bluebeam Markup Summary")).toBeVisible();
  await expect(proof.getByText("bb-summary-17")).toBeVisible();
  await expect(proof.getByText("Source id")).toBeVisible();
  await expect(proof.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(proof.getByText("Fetched")).toBeVisible();
  await expect(proof.getByText("sha256")).toBeVisible();
  await expect(proof.getByText(/^[a-f0-9]{12}$/).first()).toBeVisible();
  await expect(proof.getByText("p. 2")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("form", { name: "Pack appendix" }).locator(".packet-proof").getByText("bb-summary-17")).toBeVisible();
  const response = await request.get(`/api/projects/${projectId}/export`);
  expect(response.ok()).toBe(true);
  const packet = await response.json();
  expect(packet.appendices).toEqual([
    expect.objectContaining({
      title: "Markup Summary",
      sourceId: "bb-summary-17",
      filename: "markup-summary.pdf",
      pageCites: ["2", "14"],
    }),
  ]);
});

test("binds the accepted fact page when the markup file has no page cite", async ({ page }) => {
  await page.goto(`/projects/${projectId}?view=changes`);
  const appendix = page.getByRole("form", { name: "Pack appendix" });
  await expect(appendix.locator(".packet-chips").getByText("p. 1", { exact: true })).toBeVisible();
  await expect(appendix.getByRole("textbox", { name: "Page" })).toHaveCount(0);
  await appendix.getByLabel("File: PDF").setInputFiles({
    name: "markup-summary.pdf",
    mimeType: "application/pdf",
    buffer: buildTextPdf(["Markup Summary", "No pages listed"]),
  });
  await appendix.getByLabel("Source id").fill("bb-fact-page");
  await appendix.getByRole("button", { name: "Add pack appendix" }).click();
  const proof = appendix.locator(".packet-proof li", { hasText: "bb-fact-page" });
  await expect(proof.getByText("bb-fact-page")).toBeVisible();
  await expect(proof.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(proof.getByText(/^[a-f0-9]{12}$/)).toBeVisible();
  await expect(proof.getByText("p. 1", { exact: true })).toBeVisible();
  await expect(page.getByText("This accepted fact has no page cite.")).toHaveCount(0);
});

test("blank source id shows the upload marker on chapter and appendix proof", async ({ page }) => {
  await page.goto(`/projects/${projectId}?view=changes`);
  const chapter = page.getByRole("form", { name: "Pack chapter" });
  await chapter.getByRole("button", { name: "PDF", exact: true }).setInputFiles({
    name: "blank-source.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nblank source chapter\n%%EOF"),
  });
  await chapter.getByRole("button", { name: "Add pack chapter" }).click();
  const chapterProof = chapter.locator(".packet-proof");
  const chapterRow = chapterProof.locator("li", { hasText: "upload:" });
  await expect(chapterRow.getByText(/^upload:[a-f0-9]{64}$/)).toBeVisible();
  await expect(chapterRow.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(chapterRow.getByText(/^[a-f0-9]{12}$/)).toBeVisible();

  const appendix = page.getByRole("form", { name: "Pack appendix" });
  await appendix.getByLabel("File: PDF").setInputFiles({
    name: "blank-markup.pdf",
    mimeType: "application/pdf",
    buffer: buildTextPdf(["Markup Summary", "Page: 2"]),
  });
  await appendix.getByRole("button", { name: "Add pack appendix" }).click();
  const appendixProof = appendix.locator(".packet-proof");
  const appendixRow = appendixProof.locator("li", { hasText: "upload:" });
  await expect(appendixRow.getByText("Bluebeam Markup Summary")).toBeVisible();
  await expect(appendixRow.getByText(/^upload:[a-f0-9]{64}$/)).toBeVisible();
  await expect(appendixRow.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(appendixRow.getByText(/^[a-f0-9]{12}$/)).toBeVisible();
  await expect(appendixRow.getByText("p. 2")).toBeVisible();
  await expect(appendixRow.getByText("Source id")).toBeVisible();
  await expect(appendixRow.getByText("Fetched")).toBeVisible();
  await expect(appendixRow.getByText("sha256")).toBeVisible();
});
