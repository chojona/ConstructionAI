import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { extractConstructionFacts } from "@/lib/extractions/deterministicExtractor";
import { previewRevisionPage } from "@/lib/review/pagePreview";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import {
  DEMO_DESK_PROJECTS,
  DEMO_REVIEW_ORGANIZATION_ID,
  DEMO_REVIEW_PROJECT_ID,
  DEMO_REVIEW_REVISIONS,
  ensureDemoRevision,
  type DemoRevisionSeed,
} from "./reviewProject";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const citedRevisions = [
  DEMO_REVIEW_REVISIONS[0]!,
  DEMO_REVIEW_REVISIONS[1]!,
  revisionById("revision_document_demo_nr_basins"),
];

describe("demo page preview", () => {
  it("stores a real PDF and the page preview returns a PNG for each cited demo revision", async () => {
    for (const revision of citedRevisions) {
      const facts = extractConstructionFacts([{ pageNumber: 1, text: revision.text }]).facts;
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((fact) => fact.evidence.every((item) => item.pageNumber === 1))).toBe(true);

      const objects = await localStore();
      const db = memoryDb();
      await ensureDemoRevision(db.client, demoDocumentId(revision.id), revision, objects, async () => undefined);

      const stored = await objects.get(`demo/${revision.id}.pdf`);
      expect(stored.subarray(0, 5).toString()).toBe("%PDF-");
      const sha256 = createHash("sha256").update(stored).digest("hex");
      expect(db.created[0]).toMatchObject({
        id: revision.id,
        storageKey: `demo/${revision.id}.pdf`,
        byteSize: stored.byteLength,
        sha256,
        mimeType: "application/pdf",
      });
      expect(db.created[0]?.pages.create).toMatchObject({ pageNumber: 1, text: revision.text });

      const png = await previewCitedPage(objects, revision);
      expect(png.subarray(0, 8)).toEqual(PNG);
    }
  });

  it("puts the PDF on re-seed when the revision row already exists without bytes", async () => {
    const revision = DEMO_REVIEW_REVISIONS[0]!;
    const objects = await localStore();
    const db = memoryDb({
      id: revision.id,
      byteSize: Buffer.byteLength(revision.text),
      sha256: createHash("sha256").update(revision.text).digest("hex"),
      storageKey: `demo/${revision.id}.pdf`,
      pages: [{ pageNumber: 1 }],
      extractionRuns: [{ id: "run_1" }],
    });
    let extracted = false;
    await ensureDemoRevision(db.client, demoDocumentId(revision.id), revision, objects, async () => {
      extracted = true;
    });

    expect(extracted).toBe(false);
    const stored = await objects.get(`demo/${revision.id}.pdf`);
    expect(stored.subarray(0, 5).toString()).toBe("%PDF-");
    expect(db.updated[0]).toMatchObject({
      byteSize: stored.byteLength,
      sha256: createHash("sha256").update(stored).digest("hex"),
      storageKey: `demo/${revision.id}.pdf`,
    });
    expect(Buffer.byteLength(revision.text)).not.toBe(stored.byteLength);
    const png = await previewCitedPage(objects, revision);
    expect(png.subarray(0, 8)).toEqual(PNG);
  });

  it("paints the harbor carpet excerpt instead of a white page", async () => {
    const revision = revisionById("revision_document_demo_harbor_carpet");
    const objects = await localStore();
    const db = memoryDb();
    await ensureDemoRevision(db.client, demoDocumentId(revision.id), revision, objects, async () => undefined);

    const stored = await objects.get(`demo/${revision.id}.pdf`);
    const rects = filledRects(stored);
    expect(rects.length).toBeGreaterThan(40);
    const span = rects.reduce((box, rect) => ({
      minX: Math.min(box.minX, rect.x),
      maxX: Math.max(box.maxX, rect.x + rect.w),
    }), { minX: Number.POSITIVE_INFINITY, maxX: 0 });
    expect(span.maxX - span.minX).toBeGreaterThan(200);

    const png = await previewCitedPage(objects, revision);
    const ink = await pngInk(png);
    expect(ink.width).toBe(640);
    expect(ink.dark).toBeGreaterThan(1500);
    expect(await paintedRectCenters(png, rects)).toBeGreaterThan(rects.length * 0.9);
  });

  it("stores filled glyph paths for every demo revision before the page is rendered", async () => {
    for (const project of DEMO_DESK_PROJECTS) {
      for (const document of project.documents) {
        for (const revision of document.revisions) {
          const objects = await localStore();
          const db = memoryDb();
          await ensureDemoRevision(db.client, document.id, revision, objects, async () => undefined);
          const stored = await objects.get(`demo/${revision.id}.pdf`);
          const rects = filledRects(stored);
          const letters = revision.text.replace(/\s/g, "").length;
          expect(rects.length, revision.id).toBeGreaterThan(letters);
        }
      }
    }
  });
});

function revisionById(id: string): DemoRevisionSeed {
  for (const project of DEMO_DESK_PROJECTS) {
    for (const document of project.documents) {
      const revision = document.revisions.find((item) => item.id === id);
      if (revision) return revision;
    }
  }
  throw new Error(`Missing demo revision ${id}`);
}

function demoDocumentId(revisionId: string) {
  for (const project of DEMO_DESK_PROJECTS) {
    for (const document of project.documents) {
      if (document.revisions.some((revision) => revision.id === revisionId)) return document.id;
    }
  }
  throw new Error(`Missing demo document for ${revisionId}`);
}

async function previewCitedPage(objects: LocalObjectStore, revision: DemoRevisionSeed) {
  return previewRevisionPage({
    organizationId: DEMO_REVIEW_ORGANIZATION_ID,
    projectId: DEMO_REVIEW_PROJECT_ID,
    revisionId: revision.id,
    pageNumber: 1,
    repository: {
      async getRevision(organizationId, revisionId) {
        if (organizationId !== DEMO_REVIEW_ORGANIZATION_ID || revisionId !== revision.id) return null;
        return {
          storageKey: `demo/${revision.id}.pdf`,
          mimeType: "application/pdf",
          originalFilename: revision.filename,
          document: { projectId: DEMO_REVIEW_PROJECT_ID, project: { id: DEMO_REVIEW_PROJECT_ID } },
        };
      },
    },
    objects,
  });
}

async function localStore() {
  const root = await mkdtemp(path.join(tmpdir(), "demo-preview-"));
  roots.push(root);
  return new LocalObjectStore(root);
}

function memoryDb(existing?: {
  id: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  pages: Array<{ pageNumber: number }>;
  extractionRuns: Array<{ id: string }>;
}) {
  const created: Array<{
    id: string;
    storageKey: string;
    byteSize: number;
    sha256: string;
    mimeType: string;
    pages: { create: { pageNumber: number; text: string } };
  }> = [];
  const updated: Array<{ byteSize: number; sha256: string; storageKey: string }> = [];
  const client = {
    documentRevision: {
      async findFirst() {
        return existing ?? null;
      },
      async create({ data }: { data: (typeof created)[number] }) {
        created.push(data);
        return data;
      },
      async update({ data }: { data: (typeof updated)[number] }) {
        updated.push(data);
        return data;
      },
    },
    documentPage: {
      async create() {
        return undefined;
      },
    },
  };
  return { client: client as unknown as PrismaClient, created, updated };
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function filledRects(pdf: Buffer) {
  const source = pdf.toString("latin1");
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const match of source.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)) {
    rects.push({ x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) });
  }
  return rects;
}

async function pngInk(png: Buffer) {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index]! < 250 || data[index + 1]! < 250 || data[index + 2]! < 250) dark += 1;
  }
  return { dark, width: img.width, height: img.height };
}

async function paintedRectCenters(png: Buffer, rects: Array<{ x: number; y: number; w: number; h: number }>) {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let painted = 0;
  for (const rect of rects) {
    const scaleX = img.width / PAGE_WIDTH;
    const scaleY = img.height / PAGE_HEIGHT;
    const x = Math.round((rect.x + rect.w / 2) * scaleX);
    const y = Math.round((PAGE_HEIGHT - (rect.y + rect.h / 2)) * scaleY);
    const index = (y * img.width + x) * 4;
    if (data[index]! < 128 && data[index + 1]! < 128 && data[index + 2]! < 128) painted += 1;
  }
  return painted;
}
