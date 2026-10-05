import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { createPrismaClient } from "../../lib/db";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const db = createPrismaClient();
let projectId: string;
let documentId: string;
const projectName = `North River Bridge · Workspace QA ${Date.now()}`;

test.beforeAll(async () => {
  const organizationId = process.env.APP_ORGANIZATION_ID || "org_demo";
  await db.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: { id: organizationId, name: "Northstar Construction" },
  });
  const project = await db.project.create({ data: {
    organizationId: process.env.APP_ORGANIZATION_ID || "org_demo", name: projectName, projectNumber: "NR-026",
    documents: { create: { title: "Earthworks specification", documentType: "Specification", revisions: { create: ["1250", "1500"].map((amount, index) => {
      const text = `Excavation quantity is ${amount} CY.`;
      return { revisionLabel: `Rev 0${index + 4}`, revisionOrder: index + 1, originalFilename: `earthworks-rev0${index + 4}.pdf`, mimeType: "application/pdf", byteSize: 100, sha256: `workspace-qa-${index}`, storageKey: `workspace-qa-${index}`, status: "PROCESSED" as const,
        pages: { create: { pageNumber: 1, text } }, extractionRuns: { create: { attemptNumber: 1, extractorName: "construction-facts", extractorVersion: "construction-facts-v1", provider: "test", model: "fixture", status: "SUCCEEDED", proposedFacts: { create: { ordinal: 0, factType: "quantity", payload: { subject: "excavation", amount, unit: "CY", originalText: `${amount} CY`, modality: "asserted" } } } } } };
    }) } } },
  }, include: { documents: { include: { revisions: { include: { pages: true, extractionRuns: { include: { proposedFacts: true } } } } } } } });
  projectId = project.id;
  documentId = project.documents[0]!.id;
  for (const revision of project.documents[0]!.revisions) {
    const page = revision.pages[0]!;
    const fact = revision.extractionRuns[0]!.proposedFacts[0]!;
    await db.proposedFactEvidence.create({ data: { proposedFactId: fact.id, documentPageId: page.id, ordinal: 0, pageNumber: 1, excerpt: page.text, startOffset: 0, endOffset: page.text.length } });
  }
});

test.afterAll(async () => {
  if (projectId) {
    const decisions = await db.reviewDecision.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    for (const decision of decisions) await db.reviewDecision.delete({ where: { id: decision.id } });
    const revisions = await db.documentRevision.findMany({ where: { document: { projectId } } });
    const ids = revisions.map((revision) => revision.id);
    await db.proposedFactEvidence.deleteMany({ where: { proposedFact: { extractionRun: { documentRevisionId: { in: ids } } } } });
    await db.proposedFact.deleteMany({ where: { extractionRun: { documentRevisionId: { in: ids } } } });
    await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: ids } } });
    await db.documentPage.deleteMany({ where: { documentRevisionId: { in: ids } } });
    await db.documentRevision.deleteMany({ where: { id: { in: ids } } });
    await db.document.deleteMany({ where: { projectId } });
    await db.project.delete({ where: { id: projectId } });
  }
  await db.$disconnect();
});

test("workspace navigation, evidence, decisions, and responsive layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: new RegExp(projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/con35-projects.png" });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "Search projects and commands" }).fill(projectName);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Project" })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.locator(".change-card", { hasText: "Quantity changed" }).getByRole("button", { name: "Review" }).click();
  await expect(page.locator(".comparison-before .compare-value")).toHaveText("1250 CY");
  await expect(page.locator(".comparison-after .compare-value")).toHaveText("1500 CY");
  await expect(page.getByRole("complementary", { name: "Source evidence" })).toBeVisible();
  await page.screenshot({ path: "test-results/con35-review.png", fullPage: true });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("complementary", { name: "Source evidence" })).toBeVisible();
    await page.screenshot({ path: `test-results/con35-${width}-open-review.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const findingTitle = await page.locator("#finding-title").innerText();
  await page.locator(".evidence-panel .evidence-note a").last().click();
  await expect(page.locator("mark.source-hit")).toHaveText("Excavation quantity is 1500 CY.");
  await expect(page.getByText("Analyzed")).toBeVisible();
  await expect(page.getByText("No extracts")).toHaveCount(0);
  const sourcePath = page.url();
  await page.screenshot({ path: "test-results/con35-revision.png", fullPage: true });
  await page.getByRole("link", { name: "Back to decision" }).click();
  await expect(page.locator("#finding-title")).toHaveText(findingTitle);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".decision-sticky").getByRole("alert")).toHaveText("Enter your name before recording a decision.");
  await page.getByLabel("Reviewer", { exact: true }).fill("pm-workspace-qa");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".change-card", { hasText: "Quantity changed" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".change-card", { hasText: "Quantity changed" })).toHaveCount(0);
  await page.locator(".change-card").getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.locator(".decision-sticky").getByRole("alert")).toHaveText("Add a reason to reject.");
  await page.getByLabel("Reason").fill("Superseded by Rev 05.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("No open changes")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No open changes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Project", exact: true }).getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("link", { name: /Earthworks specification/ }).click();
  await expect(page.getByRole("heading", { name: "Revision history" })).toBeVisible();
  await page.screenshot({ path: "test-results/con35-document.png", fullPage: true });
  await page.goto("/changes");
  await expect(page.getByRole("heading", { name: "Changes", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Changes/ })).toBeVisible();
  await page.screenshot({ path: "test-results/con35-attention.png", fullPage: true });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/projects", "/changes", `/projects/${projectId}`, `/documents/${documentId}`, sourcePath]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/con35-${width}-${path.includes("documents") ? "document" : path.includes("revisions") ? "revision" : path === "/projects" ? "portfolio" : path === "/changes" ? "attention" : "project"}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);
  const decisions = await db.reviewDecision.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  expect(decisions.map((decision) => decision.decision)).toEqual(["ACCEPTED", "DISMISSED"]);
});

test("empty changes view explains the gap and opens the first upload", async ({ page }) => {
  const organizationId = process.env.APP_ORGANIZATION_ID || "org_demo";
  const name = `South Yard Staging ${Date.now()}`;
  const project = await db.project.create({ data: { organizationId, name } });
  try {
    await page.goto("/projects");
    const row = page.locator(".project-list").getByRole("link", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    await expect(row).toContainText("No project number");
    await expect(row).toContainText("0 docs");
    await expect(row).toContainText("All clear");
    await row.click();
    await expect(page.getByRole("combobox", { name: "Project" })).toHaveValue(project.id);
    await expect(page.getByText("No open changes")).toBeVisible();
    await page.getByRole("link", { name: "Upload first revision" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}\\?view=documents`));
    await expect(page.getByText("No documents yet")).toBeVisible();
    await expect(page.getByLabel("Document title")).toBeHidden();
    await page.locator(".empty-solid").getByRole("button", { name: "Add document", exact: true }).click();
    await expect(page.getByLabel("Document title")).toBeVisible();
  } finally {
    await db.project.delete({ where: { id: project.id } });
  }
});
