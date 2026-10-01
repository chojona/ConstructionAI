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

const objectTypeLabels: Record<string, string> = {
  timecard: "Timecard",
  cost_code: "Cost code",
  quantity: "Quantity",
  diary: "Diary",
  attachment: "Attachment",
};

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
  await expect(page.getByRole("heading", { name: "Needs attention" })).toHaveCount(0);

  for (const [objectType, label] of Object.entries(objectTypeLabels)) {
    const section = page.locator(`[data-object-type="${objectType}"]`);
    await expect(section.getByRole("heading", { name: label, exact: true })).toBeVisible();
    const fixtures = heavyJobFixtures.filter((fixture) => fixture.objectType === objectType);
    await expect(section.locator("article")).toHaveCount(fixtures.length);
    for (const fixture of fixtures) {
      await expect(section.getByText(fixture.sourceId)).toBeVisible();
    }
  }

  await expect(page.getByText(HEAVYJOB_FIXTURE_FETCHED_AT).first()).toBeVisible();
  const peeks = page.locator("details.raw-peek");
  await expect(peeks).toHaveCount(heavyJobFixtures.length);
  await expect(peeks.first()).not.toHaveAttribute("open", "");
  await peeks.first().locator("summary").click();
  await expect(peeks.first().locator("pre")).toContainText('"isTm"');
  await expect(page.getByText(/\b(entitlement|force account|force-account|unpaid|candidate|detection)\b/i)).toHaveCount(0);

  await tabs.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByText("No documents yet")).toBeVisible();
  await tabs.getByRole("link", { name: /^Changes/ }).click();
  await expect(page.getByRole("heading", { name: "Needs attention", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source objects" })).toHaveCount(0);
});
