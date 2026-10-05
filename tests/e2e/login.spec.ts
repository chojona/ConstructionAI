import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { DEMO_USER_EMAIL } from "../../lib/auth/demoUser";
import { createPrismaClient } from "../../lib/db";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

test("rejects a wrong password and a request with no session", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(DEMO_USER_EMAIL);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".form-error")).toHaveText("Email or password is incorrect.");
  const denied = await page.request.post("/api/projects", { data: { name: "Unsigned project" } });
  expect(denied.status()).toBe(401);
  await context.close();
});

test("accepting an invitation signs in that person and activates the membership", async ({ page }) => {
  const db = createPrismaClient();
  const email = `accept-${Date.now()}@northstar.example`;
  try {
    const invited = await page.request.post("/api/org/memberships", {
      data: { email, name: "New Person", role: "VIEWER" },
    });
    expect(invited.status()).toBe(201);
    const body = await invited.json();
    expect(body.membership.status).toBe("INVITED");
    expect(body.membership.role).toBe("VIEWER");

    await page.goto(body.membership.acceptPath);
    await expect(page.getByRole("heading", { name: "Accept invitation" })).toBeVisible();
    await page.getByLabel("Your name").fill("Pat Lee");
    await page.getByLabel("Password", { exact: true }).fill("accept-password-1");
    await page.getByLabel("Confirm password").fill("accept-password-1");
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    const membership = await db.orgMembership.findUniqueOrThrow({
      where: { id: body.membership.id },
      include: { user: true },
    });
    expect(membership.status).toBe("ACTIVE");
    expect(membership.role).toBe("VIEWER");
    expect(membership.acceptTokenHash).toBeNull();
    expect(membership.user.email).toBe(email);
    expect(membership.user.name).toBe("Pat Lee");

    const denied = await page.request.post("/api/org/memberships", {
      data: { email: `other-${Date.now()}@northstar.example`, role: "VIEWER" },
    });
    expect(denied.status()).toBe(403);
  } finally {
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.orgMembership.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  }
});
