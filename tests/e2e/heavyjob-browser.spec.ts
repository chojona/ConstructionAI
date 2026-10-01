import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createPrismaClient } from "../../lib/db";
import {
  HEAVYJOB_DEMO_PROJECT_ID,
  HEAVYJOB_DEMO_PROJECT_NAME,
  HEAVYJOB_FIXTURE_FETCHED_AT,
  heavyJobFixtures,
} from "../../lib/heavyjob/fixtures";
import { seedHeavyJobDemoProject } from "../../lib/heavyjob/loadFixtures";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

test.beforeAll(async () => {
  const db = createPrismaClient();
  const organizationId = process.env.APP_ORGANIZATION_ID?.trim() || "org_demo";
  await db.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: { id: organizationId, name: "Northstar Construction" },
  });
  await seedHeavyJobDemoProject(db, organizationId);
  await db.$disconnect();
});

test("demo project lists HeavyJob source objects without a review queue", async ({ page }) => {
  await page.goto(`/projects/${HEAVYJOB_DEMO_PROJECT_ID}?view=heavyjob`);
  await expect(page.getByRole("heading", { name: HEAVYJOB_DEMO_PROJECT_NAME })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Project", exact: true });
  await expect(tabs.getByRole("link", { name: "HeavyJob", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: /^Changes/ })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source objects", exact: true })).toBeVisible();
  await expect(page.getByText("Add document")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Needs attention/ })).toHaveCount(0);
  for (const column of ["type", "sourceId", "fetchedAt", "raw"]) {
    await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible();
  }

  for (const fixture of heavyJobFixtures) {
    const row = page.getByRole("row").filter({ has: page.locator("code").getByText(fixture.sourceId, { exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell", { name: fixture.objectType, exact: true })).toBeVisible();
    await expect(row.locator("time")).toHaveText(HEAVYJOB_FIXTURE_FETCHED_AT);
  }

  const peeks = page.locator("details.raw-peek");
  await expect(peeks).toHaveCount(heavyJobFixtures.length);
  await expect(peeks.first()).not.toHaveAttribute("open", "");
  await peeks.first().locator("summary").click();
  await expect(peeks.first().locator("pre")).toContainText('"isTm"');
  await expect(page.getByText(/\b(entitlement|dsc|force account|force-account|unpaid|candidate|detection)\b/i)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await tabs.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByText("No documents yet")).toBeVisible();
  await tabs.getByRole("link", { name: /^Changes/ }).click();
  await expect(page.getByRole("heading", { name: "Changes Needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source objects" })).toHaveCount(0);
});
