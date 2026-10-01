import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CONSTRUCTION_FACTS_FIXTURES } from "@/lib/extractions/eval/fixtures";
import { deterministicConstructionFactsModel } from "@/lib/extractions/deterministicExtractor";
import { runConstructionFactsExtraction } from "@/lib/extractions/constructionFacts";
import { recordReviewDecision } from "@/lib/review/service";
import { proposedFactSubjectKey } from "@/lib/review/subjects";

export const DEMO_REVIEW_ORGANIZATION_ID = "org_demo";
export const DEMO_REVIEW_PROJECT_ID = "project_demo_review";
export const DEMO_REVIEW_PROJECT_NAME = "North River Bridge";
export const DEMO_REVIEW_PROJECT_NUMBER = "NR-014";
export const DEMO_REVIEW_DOCUMENT_ID = "document_demo_earthworks";
export const DEMO_REVIEW_DOCUMENT_TITLE = "Earthworks specification";

function quantityFixtureText() {
  const text = CONSTRUCTION_FACTS_FIXTURES.find((fixture) => fixture.id === "quantity-unit")?.pages[0]?.text;
  if (!text?.includes("1,250")) {
    throw new Error("The quantity-unit fixture is required to seed the demo review project.");
  }
  return text;
}

const baseText = quantityFixtureText();

/** Two revisions of the checked-in quantity fixture. The second amount is a material change. */
export const DEMO_REVIEW_REVISIONS = [
  {
    id: "revision_demo_earthworks_04",
    label: "Rev 04",
    order: 1,
    filename: "earthworks-rev04.pdf",
    text: baseText,
  },
  {
    id: "revision_demo_earthworks_05",
    label: "Rev 05",
    order: 2,
    filename: "earthworks-rev05.pdf",
    text: baseText.replace("1,250", "1,500"),
  },
] as const;

function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Idempotent document-review demo for org_demo.
 * Page text comes from the existing quantity fixture. Facts are recorded by the
 * in-repo extractor. Review decisions already stored on these revisions are left in place.
 */
export async function seedDemoReviewProject(db: PrismaClient) {
  await db.project.upsert({
    where: { id: DEMO_REVIEW_PROJECT_ID },
    update: {
      organizationId: DEMO_REVIEW_ORGANIZATION_ID,
      name: DEMO_REVIEW_PROJECT_NAME,
      projectNumber: DEMO_REVIEW_PROJECT_NUMBER,
    },
    create: {
      id: DEMO_REVIEW_PROJECT_ID,
      organizationId: DEMO_REVIEW_ORGANIZATION_ID,
      name: DEMO_REVIEW_PROJECT_NAME,
      projectNumber: DEMO_REVIEW_PROJECT_NUMBER,
    },
  });

  await db.document.upsert({
    where: { id: DEMO_REVIEW_DOCUMENT_ID },
    update: {
      projectId: DEMO_REVIEW_PROJECT_ID,
      title: DEMO_REVIEW_DOCUMENT_TITLE,
      documentType: "Specification",
    },
    create: {
      id: DEMO_REVIEW_DOCUMENT_ID,
      projectId: DEMO_REVIEW_PROJECT_ID,
      title: DEMO_REVIEW_DOCUMENT_TITLE,
      documentType: "Specification",
    },
  });

  for (const revision of DEMO_REVIEW_REVISIONS) {
    const existing = await db.documentRevision.findFirst({
      where: { documentId: DEMO_REVIEW_DOCUMENT_ID, revisionLabel: revision.label },
      select: {
        id: true,
        extractionRuns: { where: { status: "SUCCEEDED" }, select: { id: true }, take: 1 },
      },
    });
    if (!existing) {
      await db.documentRevision.create({
        data: {
          id: revision.id,
          documentId: DEMO_REVIEW_DOCUMENT_ID,
          revisionLabel: revision.label,
          revisionOrder: revision.order,
          originalFilename: revision.filename,
          mimeType: "application/pdf",
          byteSize: Buffer.byteLength(revision.text),
          sha256: digest(revision.text),
          storageKey: `demo/${revision.id}.pdf`,
          status: "PROCESSED",
          pages: {
            create: { pageNumber: 1, text: revision.text, textSha256: digest(revision.text) },
          },
        },
      });
    }
    if (existing && existing.extractionRuns.length > 0) continue;
    await runConstructionFactsExtraction({
      organizationId: DEMO_REVIEW_ORGANIZATION_ID,
      documentRevisionId: existing?.id ?? revision.id,
      model: deterministicConstructionFactsModel,
    });
  }

  await settleDemoBaseFact(db);
}

/** Accept the first revision's fact so the demo queue is the single material change. */
async function settleDemoBaseFact(db: PrismaClient) {
  const base = DEMO_REVIEW_REVISIONS[0];
  const revision = await db.documentRevision.findFirst({
    where: { id: base.id, documentId: DEMO_REVIEW_DOCUMENT_ID },
    include: {
      extractionRuns: {
        where: { status: "SUCCEEDED" },
        orderBy: { attemptNumber: "desc" },
        take: 1,
        include: { proposedFacts: { orderBy: { ordinal: "asc" }, take: 1 } },
      },
    },
  });
  const fact = revision?.extractionRuns[0]?.proposedFacts[0];
  if (!fact) return;
  const subjectKey = proposedFactSubjectKey(fact.id);
  const prior = await db.reviewDecision.findFirst({
    where: { projectId: DEMO_REVIEW_PROJECT_ID, subjectKey },
    select: { id: true },
  });
  if (prior) return;
  await recordReviewDecision(DEMO_REVIEW_ORGANIZATION_ID, DEMO_REVIEW_PROJECT_ID, "demo-seed", {
    decision: "ACCEPTED",
    subject: { type: "proposed_fact", proposedFactId: fact.id },
  });
}
