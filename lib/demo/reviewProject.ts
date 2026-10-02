import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { CONSTRUCTION_FACTS_FIXTURES } from "@/lib/extractions/eval/fixtures";
import { deterministicConstructionFactsModel } from "@/lib/extractions/deterministicExtractor";
import { runConstructionFactsExtraction } from "@/lib/extractions/constructionFacts";
import { recordReviewDecision } from "@/lib/review/service";
import { proposedFactSubjectKey } from "@/lib/review/subjects";
import { requireObjectStore, StorageImmutableError, type ObjectStore } from "@/lib/storage/objectStore";

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

export type DemoSector = "civil" | "commercial";

export type DemoLedgerDecision = {
  revisionOrder: number;
  ordinal: number;
  decision: "ACCEPTED" | "DISMISSED";
  reason: string | null;
};

export type DemoRevisionSeed = {
  id: string;
  label: string;
  order: number;
  filename: string;
  text: string;
};

export type DemoDocumentSeed = {
  id: string;
  title: string;
  documentType: string;
  revisions: readonly DemoRevisionSeed[];
  decisions: readonly DemoLedgerDecision[];
};

export type DemoProjectSeed = {
  id: string;
  name: string;
  projectNumber: string;
  sector: DemoSector;
  documents: readonly DemoDocumentSeed[];
};

const accept = (ordinal: number): DemoLedgerDecision => ({
  revisionOrder: 1,
  ordinal,
  decision: "ACCEPTED",
  reason: null,
});

const dismiss = (reason: string): DemoLedgerDecision => ({
  revisionOrder: 1,
  ordinal: 0,
  decision: "DISMISSED",
  reason,
});

function singleDoc(input: {
  id: string;
  title: string;
  documentType: string;
  text: string;
  decision: DemoLedgerDecision;
}): DemoDocumentSeed {
  return {
    id: input.id,
    title: input.title,
    documentType: input.documentType,
    revisions: [{
      id: `revision_${input.id}`,
      label: "Rev A",
      order: 1,
      filename: `${input.id}.pdf`,
      text: input.text,
    }],
    decisions: [input.decision],
  };
}

const earthworksDocument: DemoDocumentSeed = {
  id: DEMO_REVIEW_DOCUMENT_ID,
  title: DEMO_REVIEW_DOCUMENT_TITLE,
  documentType: "Specification",
  revisions: DEMO_REVIEW_REVISIONS.map((revision) => ({ ...revision })),
  decisions: [accept(0)],
};

const northRiverSpecial: DemoDocumentSeed = {
  id: "document_demo_nr_special_provisions",
  title: "Special provisions",
  documentType: "Specification",
  revisions: [
    {
      id: "revision_demo_nr_sp_a",
      label: "Rev A",
      order: 1,
      filename: "nr-special-provisions-a.pdf",
      text: [
        "Structural excavation 4200 CY.",
        "Deck pours shall begin on 2026-07-06.",
        "A hydraulic excavator shall be used for the pile caps.",
      ].join("\n"),
    },
    {
      id: "revision_demo_nr_sp_b",
      label: "Rev B",
      order: 2,
      filename: "nr-special-provisions-b.pdf",
      text: [
        "Structural excavation 5100 CY.",
        "Deck pours shall begin on 2026-08-20.",
        "A tower crane shall be used for the pile caps.",
      ].join("\n"),
    },
  ],
  decisions: [accept(0), accept(1), accept(2)],
};

const harborDrawings: DemoDocumentSeed = {
  id: "document_demo_harbor_storefront",
  title: "Storefront drawing",
  documentType: "Drawing",
  revisions: [
    {
      id: "revision_demo_harbor_storefront_a",
      label: "Rev A",
      order: 1,
      filename: "harbor-storefront-a.pdf",
      text: [
        "2400 sf of storefront glass.",
        "Tenant lobby shall begin on 2026-05-04.",
        "A dewatering pump shall be provided for the elevator pit.",
      ].join("\n"),
    },
    {
      id: "revision_demo_harbor_storefront_b",
      label: "Rev B",
      order: 2,
      filename: "harbor-storefront-b.pdf",
      text: [
        "3100 sf of storefront glass.",
        "Tenant lobby shall begin on 2026-06-15.",
        "A tower crane shall be used for the curtain wall.",
      ].join("\n"),
    },
  ],
  decisions: [accept(0), accept(1), accept(2)],
};

/** Portfolio loaded for org_demo. North River Bridge keeps its existing earthworks ids. */
export const DEMO_DESK_PROJECTS: readonly DemoProjectSeed[] = [
  {
    id: DEMO_REVIEW_PROJECT_ID,
    name: DEMO_REVIEW_PROJECT_NAME,
    projectNumber: DEMO_REVIEW_PROJECT_NUMBER,
    sector: "civil",
    documents: [
      earthworksDocument,
      northRiverSpecial,
      singleDoc({
        id: "document_demo_nr_fence",
        title: "Temporary fence",
        documentType: "Plan",
        text: "180 LF of temporary fence.",
        decision: dismiss("Already covered by the site logistics plan."),
      }),
      singleDoc({
        id: "document_demo_nr_basins",
        title: "Catch basins",
        documentType: "Plan",
        text: "Catch basins 16 EA.",
        decision: accept(0),
      }),
      singleDoc({
        id: "document_demo_nr_seeding",
        title: "Seeding specification",
        documentType: "Specification",
        text: "12000 sf of seeding.",
        decision: accept(0),
      }),
    ],
  },
  {
    id: "project_demo_harbor",
    name: "Harbor Warehouse Fit-Out",
    projectNumber: "HW-220",
    sector: "commercial",
    documents: [
      harborDrawings,
      singleDoc({
        id: "document_demo_harbor_dock",
        title: "Loading dock",
        documentType: "Plan",
        text: "A CAT 336 excavator shall be used for the loading dock.",
        decision: dismiss("The loading dock uses the equipment already on site."),
      }),
      singleDoc({
        id: "document_demo_harbor_carpet",
        title: "Carpet tile",
        documentType: "Specification",
        text: "6400 sf of carpet tile.",
        decision: accept(0),
      }),
      singleDoc({
        id: "document_demo_harbor_casework",
        title: "Casework",
        documentType: "Specification",
        text: "86 LF of casework.",
        decision: accept(0),
      }),
    ],
  },
  {
    id: "project_demo_pike",
    name: "Pike Street Bus Corridor",
    projectNumber: "PS-308",
    sector: "civil",
    documents: [
      singleDoc({
        id: "document_demo_pike_asphalt",
        title: "Asphalt paving",
        documentType: "Specification",
        text: "Asphalt paving 1800 CY.",
        decision: accept(0),
      }),
      singleDoc({
        id: "document_demo_pike_sidewalk",
        title: "Sidewalk",
        documentType: "Plan",
        text: "2400 sf of sidewalk.",
        decision: accept(0),
      }),
      singleDoc({
        id: "document_demo_pike_closures",
        title: "Lane closures",
        documentType: "Schedule",
        text: "Lane closures shall begin on 2026-06-08.",
        decision: accept(0),
      }),
    ],
  },
  {
    id: "project_demo_i405",
    name: "I-405 Bellevue Widening",
    projectNumber: "I405-17",
    sector: "civil",
    documents: [
      singleDoc({ id: "document_demo_i405_fill", title: "Structural fill", documentType: "Specification", text: "Structural fill 1800 CY.", decision: accept(0) }),
      singleDoc({ id: "document_demo_i405_rock", title: "Rock excavation", documentType: "Specification", text: "Rock excavation 640 CY.", decision: accept(0) }),
      singleDoc({ id: "document_demo_i405_guardrail", title: "Guardrail", documentType: "Plan", text: "240 LF of guardrail.", decision: accept(0) }),
      singleDoc({ id: "document_demo_i405_piles", title: "Production piles", documentType: "Plan", text: "Production piles 148 EA.", decision: accept(0) }),
      singleDoc({ id: "document_demo_i405_barrier", title: "Barrier panels", documentType: "Plan", text: "A tower crane shall be used for the barrier panels.", decision: accept(0) }),
      singleDoc({ id: "document_demo_i405_completion", title: "Substantial completion", documentType: "Schedule", text: "Substantial completion shall be 2026-11-15.", decision: accept(0) }),
    ],
  },
  {
    id: "project_demo_fremont",
    name: "Fremont Clinic TI",
    projectNumber: "FC-088",
    sector: "commercial",
    documents: [
      singleDoc({
        id: "document_demo_fremont_ceiling",
        title: "Ceiling grid",
        documentType: "Drawing",
        text: "4200 sf of ceiling grid.",
        decision: accept(0),
      }),
      singleDoc({
        id: "document_demo_fremont_pump",
        title: "Sump pump",
        documentType: "Specification",
        text: "A dewatering pump shall be provided for the sump.",
        decision: accept(0),
      }),
    ],
  },
];

function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function digestBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Idempotent document-review demo for org_demo.
 * Page text is read by the in-repo extractor. Decisions already stored are left in place.
 */
export async function seedDemoReviewProject(db: PrismaClient, objects: ObjectStore = requireObjectStore()) {
  for (const project of DEMO_DESK_PROJECTS) {
    await db.project.upsert({
      where: { id: project.id },
      update: {
        organizationId: DEMO_REVIEW_ORGANIZATION_ID,
        name: project.name,
        projectNumber: project.projectNumber,
      },
      create: {
        id: project.id,
        organizationId: DEMO_REVIEW_ORGANIZATION_ID,
        name: project.name,
        projectNumber: project.projectNumber,
      },
    });
    for (const document of project.documents) {
      await db.document.upsert({
        where: { id: document.id },
        update: {
          projectId: project.id,
          title: document.title,
          documentType: document.documentType,
        },
        create: {
          id: document.id,
          projectId: project.id,
          title: document.title,
          documentType: document.documentType,
        },
      });
      for (const revision of document.revisions) {
        await ensureDemoRevision(db, document.id, revision, objects);
      }
      await settleDocument(db, project.id, document);
    }
  }
}

/**
 * Writes the demo PDF into the shared object store, then creates or repairs the revision row.
 * Re-seed still stores bytes when the Postgres row already exists.
 */
export async function ensureDemoRevision(
  db: PrismaClient,
  documentId: string,
  revision: DemoRevisionSeed,
  objects: ObjectStore,
  extract: (revisionId: string) => Promise<void> = extractDemoRevision,
) {
  const stored = await storeDemoRevisionPdf(objects, revision);
  const existing = await db.documentRevision.findFirst({
    where: { documentId, revisionLabel: revision.label },
    select: {
      id: true,
      byteSize: true,
      sha256: true,
      storageKey: true,
      pages: { select: { pageNumber: true } },
      extractionRuns: { where: { status: "SUCCEEDED" }, select: { id: true }, take: 1 },
    },
  });
  if (!existing) {
    await db.documentRevision.create({
      data: {
        id: revision.id,
        documentId,
        revisionLabel: revision.label,
        revisionOrder: revision.order,
        originalFilename: revision.filename,
        mimeType: "application/pdf",
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        status: "PROCESSED",
        pages: {
          create: { pageNumber: 1, text: revision.text, textSha256: digest(revision.text) },
        },
      },
    });
    await extract(revision.id);
    return;
  }
  if (existing.byteSize !== stored.byteSize || existing.sha256 !== stored.sha256 || existing.storageKey !== stored.storageKey) {
    await db.documentRevision.update({
      where: { id: existing.id },
      data: {
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        originalFilename: revision.filename,
      },
    });
  }
  if (!existing.pages.some((page) => page.pageNumber === 1)) {
    await db.documentPage.create({
      data: {
        documentRevisionId: existing.id,
        pageNumber: 1,
        text: revision.text,
        textSha256: digest(revision.text),
      },
    });
  }
  if (existing.extractionRuns.length > 0) return;
  await extract(existing.id);
}

async function storeDemoRevisionPdf(objects: ObjectStore, revision: DemoRevisionSeed) {
  const bytes = buildTextPdf([revision.text]);
  const storageKey = `demo/${revision.id}.pdf`;
  try {
    await objects.put(storageKey, bytes);
  } catch (error) {
    if (!(error instanceof StorageImmutableError)) throw error;
    await objects.delete(storageKey);
    await objects.put(storageKey, bytes);
  }
  return { storageKey, byteSize: bytes.byteLength, sha256: digestBytes(bytes) };
}

async function extractDemoRevision(revisionId: string) {
  await runConstructionFactsExtraction({
    organizationId: DEMO_REVIEW_ORGANIZATION_ID,
    documentRevisionId: revisionId,
    model: deterministicConstructionFactsModel,
  });
}

/** Record the desk's accepted and dismissed facts. Later reviewer decisions stay put. */
async function settleDocument(db: PrismaClient, projectId: string, document: DemoDocumentSeed) {
  if (document.decisions.length === 0) return;
  const revisions = await db.documentRevision.findMany({
    where: { documentId: document.id },
    orderBy: [{ revisionOrder: "asc" }, { id: "asc" }],
    include: {
      extractionRuns: {
        where: { status: "SUCCEEDED" },
        orderBy: { attemptNumber: "desc" },
        take: 1,
        include: { proposedFacts: { orderBy: { ordinal: "asc" } } },
      },
    },
  });
  for (const decision of document.decisions) {
    const revision = revisions.find((item) => item.revisionOrder === decision.revisionOrder);
    const fact = revision?.extractionRuns[0]?.proposedFacts.find((item) => item.ordinal === decision.ordinal);
    if (!fact) continue;
    const subjectKey = proposedFactSubjectKey(fact.id);
    const prior = await db.reviewDecision.findFirst({
      where: { projectId, subjectKey },
      select: { id: true },
    });
    if (prior) continue;
    await recordReviewDecision(DEMO_REVIEW_ORGANIZATION_ID, projectId, "demo-seed", {
      decision: decision.decision,
      reason: decision.reason ?? undefined,
      subject: { type: "proposed_fact", proposedFactId: fact.id },
    });
  }
}
