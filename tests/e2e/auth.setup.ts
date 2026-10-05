import { mkdir } from "node:fs/promises";
import { expect, test as setup } from "@playwright/test";
import { DEMO_USER_EMAIL } from "../../lib/auth/demoUser";
import { E2E_DEMO_PASSWORD, ensureDemoLogin } from "../support/demoSession";

const authFile = "tests/e2e/.auth/state.json";

setup("sign in the demo admin", async ({ page }) => {
  await ensureDemoLogin();
  await mkdir("tests/e2e/.auth", { recursive: true });
  const response = await page.request.post("/api/auth/login", {
    data: { email: DEMO_USER_EMAIL, password: E2E_DEMO_PASSWORD },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.context().storageState({ path: authFile });
});
