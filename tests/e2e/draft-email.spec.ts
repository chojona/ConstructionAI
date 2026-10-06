import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { createPrismaClient } from "../../lib/db";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const db = createPrismaClient();
let projectId = "";
const projectName = `Email Pack QA ${Date.now()}`;

test.beforeAll(async () => {
  const organizationId = process.env.APP_ORGANIZATION_ID || "org_demo";
  await db.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: { id: organizationId, name: "Northstar Construction" },
  });
  const project = await db.project.create({
    data: {
      organizationId,
      name: projectName,
      projectNumber: "EM-058",
      documents: {
        create: {
          title: "Earthworks specification",
          documentType: "Specification",
          revisions: {
            create: ["1250", "1500"].map((amount, index) => {
              const text = `Excavation quantity is ${amount} CY.`;
              return {
                revisionLabel: `Rev 0${index + 1}`,
                revisionOrder: index + 1,
                originalFilename: `email-earthworks-${index}.pdf`,
                mimeType: "application/pdf",
                byteSize: 100,
                sha256: `email-qa-${projectName}-${index}`,
                storageKey: `email-qa-${projectName}-${index}`,
                status: "PROCESSED" as const,
                pages: { create: { pageNumber: 1, text } },
                extractionRuns: {
                  create: {
                    attemptNumber: 1,
                    extractorName: "construction-facts",
                    extractorVersion: "construction-facts-v1",
                    provider: "test",
                    model: "fixture",
                    status: "SUCCEEDED" as const,
                    proposedFacts: {
                      create: {
                        ordinal: 0,
                        factType: "quantity" as const,
                        payload: { subject: "excavation", amount, unit: "CY", originalText: `${amount} CY`, modality: "asserted" },
                      },
                    },
                  },
                },
              };
            }),
          },
        },
      },
    },
    include: { documents: { include: { revisions: { include: { pages: true, extractionRuns: { include: { proposedFacts: true } } } } } } },
  });
  projectId = project.id;
  for (const revision of project.documents[0]!.revisions) {
    const page = revision.pages[0]!;
    const fact = revision.extractionRuns[0]!.proposedFacts[0]!;
    await db.proposedFactEvidence.create({
      data: {
        proposedFactId: fact.id,
        documentPageId: page.id,
        ordinal: 0,
        pageNumber: 1,
        excerpt: page.text,
        startOffset: 0,
        endOffset: page.text.length,
      },
    });
  }
});

test.afterAll(async () => {
  if (projectId) {
    await db.emailSendDecision.deleteMany({ where: { emailSend: { projectId } } });
    await db.emailSendDocument.deleteMany({ where: { emailSend: { projectId } } });
    await db.emailSend.deleteMany({ where: { projectId } });
    await db.exportPacketDecision.deleteMany({ where: { exportPacket: { projectId } } });
    await db.exportPacket.deleteMany({ where: { projectId } });
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

test("draft email stays gated until approve and send records the ledger", async ({ page }) => {
  const banned = /\b(cold outreach|auto-send|claim filing|entitlement|dsc|pco|change order|force account|candidate)\b/i;
  await page.goto(`/projects/${projectId}?view=changes`);
  await expect(page.getByText("Finish open reviews before exporting.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft email" })).toHaveCount(0);
  await expect(page.getByText(banned)).toHaveCount(0);

  await page.locator(".change-card", { hasText: "Quantity changed" }).getByRole("button", { name: "Review" }).click();
  await page.getByLabel("Reviewer", { exact: true }).fill("Alex Chen");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("link", { name: "Export approved pack" })).toHaveCount(0);
  await page.locator(".change-card").getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Draft email" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export approved pack" })).toBeVisible();

  await page.getByRole("button", { name: "Draft email" }).click();
  const panel = page.getByRole("dialog", { name: "Draft email with approved pack" });
  await expect(panel.getByText("Export or build pack first")).toBeVisible();
  await panel.getByRole("button", { name: "Cancel" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export approved pack" }).click();
  await download;

  await page.getByRole("button", { name: "Draft email" }).click();
  await expect(panel.getByLabel("Subject")).toHaveValue(`${projectName} — approved facts pack`);
  await expect(panel.getByText("Approved", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Earthworks specification · Rev 0[12] · p\. 1/).first()).toBeVisible();
  await panel.getByLabel("To").fill("pm@example.com, accountant@example.com");
  await panel.getByLabel("Sender").fill("Alex Chen");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByText("Send recorded.")).toBeVisible();
  await panel.getByRole("link", { name: "Open ledger row" }).click();

  await expect(page.getByText("Email send ledger")).toBeVisible();
  await expect(page.getByText("Human send recorded.")).toBeVisible();
  await expect(page.getByText("pm@example.com, accountant@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: `${projectName} — approved facts pack` })).toBeVisible();
  await expect(page.getByText("Alex Chen")).toBeVisible();
  const stored = await db.emailSend.findFirstOrThrow({
    where: { projectId },
    include: { decisions: true, documents: true },
  });
  expect(stored.status).toBe("SENT");
  expect(stored.recipients).toEqual(["pm@example.com", "accountant@example.com"]);
  expect(stored.actorId).toBe("Alex Chen");
  expect(stored.sentAt).toBeTruthy();
  await expect(page.getByText(stored.exportPacketId)).toBeVisible();
  await expect(page.getByText(stored.documents[0]!.documentId)).toBeVisible();
  await expect(page.getByText(stored.decisions[0]!.reviewDecisionId)).toBeVisible();
  await expect(page.getByText(banned)).toHaveCount(0);
});
