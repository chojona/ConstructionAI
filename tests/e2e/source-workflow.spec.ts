import { expect, test } from "@playwright/test";
import { buildTextPdf } from "../../lib/documents/minimalPdf";

test("creates a project, document, and text revision through the UI", async ({ page }) => {
  const suffix = Date.now().toString();
  await page.goto("/projects");
  await page.locator("summary").getByText("New project", { exact: true }).click();
  await page.getByLabel("Project name").fill(`I-95 Bridge ${suffix}`);
  await page.getByLabel(/Project number/).fill(`PW-${suffix}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: `I-95 Bridge ${suffix}` })).toBeVisible();

  await page.locator("summary").getByText("Add document", { exact: true }).click();
  await page.getByLabel("Document title").fill("Drainage Plan");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.getByRole("heading", { name: "Drainage Plan" })).toBeVisible();

  await page.locator("summary").getByText("Upload revision", { exact: true }).click();
  await page.getByLabel("Revision label").fill("Revision A");
  const pdf = buildTextPdf(["Sheet C-101", "Pipe Schedule: 24 IN RCP"]);
  await page.getByLabel("PDF file").setInputFiles({ name: "drainage.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Upload revision" }).click();
  await expect(page.getByRole("heading", { name: "Revision A" })).toBeVisible();
  await expect(page.getByText("Sheet C-101")).toBeVisible();
  await expect(page.getByText("Pipe Schedule: 24 IN RCP")).toBeVisible();
});
