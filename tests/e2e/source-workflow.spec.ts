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

  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/view=documents/);
  await expect(page.getByLabel("Document title")).toBeHidden();
  await page.locator(".empty-solid").getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByLabel("Document title")).toBeVisible();
  await expect(page.getByLabel("Document title")).toBeFocused();

  await page.getByLabel("Document title").fill("Drainage Plan");
  await page.getByLabel(/Document type/).fill("Plan set");
  await page.getByLabel("Revision label").fill("Revision A");
  const pdf = buildTextPdf(["Sheet C-101", "Pipe Schedule: 24 IN RCP"]);
  await page.getByLabel("PDF file").setInputFiles({ name: "drainage.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.locator("#add-document").getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByRole("link", { name: /Drainage Plan/ })).toBeVisible();
  await expect(page.getByText("1 revision").first()).toBeVisible();
  await expect(page.getByText("Plan set")).toBeVisible();
  await expect(page.getByText("Latest document")).toHaveCount(0);
  await expect(page.getByText("Unclassified document")).toHaveCount(0);

  await page.getByRole("link", { name: /Drainage Plan/ }).click();
  await expect(page.getByRole("heading", { name: "Drainage Plan" })).toBeVisible();
  await page.getByRole("link", { name: /Revision A/ }).click();
  await expect(page.getByRole("heading", { name: "Revision A" })).toBeVisible();
  await expect(page.getByText("No extracts")).toBeVisible();
  await expect(page.getByText("Analyzed")).toHaveCount(0);
  await expect(page.getByText("No proposed facts from this revision yet.")).toBeVisible();
  await expect(page.getByText("Nothing to review yet")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Full document" })).toBeVisible();
  await expect(page.getByText("Sheet C-101")).toBeVisible();
  await expect(page.getByText("Pipe Schedule: 24 IN RCP")).toBeVisible();

  await page.goBack();
  await page.locator("summary").getByText("Upload revision", { exact: true }).click();
  await page.getByLabel("Revision label").fill("Revision B");
  const nextPdf = buildTextPdf(["Sheet C-102"]);
  await page.getByLabel("PDF file").setInputFiles({ name: "drainage-b.pdf", mimeType: "application/pdf", buffer: nextPdf });
  await page.getByRole("button", { name: "Upload revision" }).click();
  await expect(page.getByRole("heading", { name: "Revision B" })).toBeVisible();
  await expect(page.getByText("Sheet C-102")).toBeVisible();
});

test("documents list omits an unset type", async ({ page }) => {
  const suffix = Date.now().toString();
  await page.goto("/projects");
  await page.locator("summary").getByText("New project", { exact: true }).click();
  await page.getByLabel("Project name").fill(`Desk Polish ${suffix}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: `Desk Polish ${suffix}` })).toBeVisible();

  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.locator(".empty-solid").getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Document title").fill("Drainage Plan");
  await page.getByLabel("Revision label").fill("Revision A");
  const pdf = buildTextPdf(["Sheet C-101", "Pipe Schedule: 24 IN RCP"]);
  await page.getByLabel("PDF file").setInputFiles({ name: "drainage-plan.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.locator("#add-document").getByRole("button", { name: "Add document", exact: true }).click();

  const row = page.getByRole("link", { name: /Drainage Plan/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("1 revision");
  await expect(row).not.toContainText("Unclassified");
  await expect(page.getByText("Latest document")).toHaveCount(0);
  await expect(page.locator(".document-rail")).toHaveCount(0);

  await row.click();
  await page.getByRole("link", { name: /Revision A/ }).click();
  await expect(page.getByRole("heading", { name: "Revision A" })).toBeVisible();
  const reading = page.locator(".state-panel", { has: page.locator("#reading-status") });
  const analysis = page.locator(".state-panel", { has: page.locator("#analysis-status") });
  await expect(reading.locator(".status-label")).toHaveText("Current");
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Latest", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Revision \d+/)).toHaveCount(0);
  await expect(analysis.locator(".status-label")).toHaveText("No extracts");
  await expect(analysis).not.toHaveClass(/state-ready/);
  await expect(page.getByText("Analyzed")).toHaveCount(0);
  await expect(page.getByText("No proposed facts from this revision yet.")).toBeVisible();
  await expect(page.locator(".page-chip", { hasText: "Page 1" })).toBeVisible();
  await expect(page.locator(".page-source-body").first()).toContainText("Sheet C-101");
});
