import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { getEmailDraftSource, recordEmailSend } from "@/lib/email/service";
import { defaultEmailBody } from "@/lib/email/emailSendView";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { LocalObjectStore } from "@/lib/storage/objectStore";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { attachAccPdfChapter } from "./accChapter";
import { attachBluebeamMarkupAppendix, markupSummaryPageCites } from "./bluebeamAppendix";
import { canonicalPacketBytes, packetContentHash } from "./exportPacket";
import {
  ADD_PACK_APPENDIX_LABEL,
  BLUEBEAM_MARKUP_APPENDIX_LABEL,
  BLUEBEAM_MARKUP_APPENDIX_TITLE,
  PACK_CITE_UNPINNED_MESSAGE,
  appendixFactBinding,
  EXPORT_BLOCKED_MESSAGE,
  PACK_APPENDIX_ADDED_MESSAGE,
  PACK_APPENDIX_FILE_LABEL,
  packProofChrome,
  shortContentSha256,
  visiblePackProof,
} from "./exportPacketView";
import { currentApprovedChangePacket, exportApprovedChangePacket, recordReviewDecision } from "./service";

const BANNED_COPY = /\b(dsc|fa|force account|force-account|change orders?|co|pco|entitlement|candidate|unpaid|claim|detection)\b/i;

const trench = "A CAT 336 excavator shall be used for the trench.";
const dozer = "A dozer shall be used.";
const pump = "A pump shall dewater the excavation.";
const loader = "A loader shall stockpile the spoil.";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Bluebeam markup summary appendix", () => {
  it("uses the locked desk copy", () => {
    expect(PACK_APPENDIX_FILE_LABEL).toBe("File: PDF");
    expect(ADD_PACK_APPENDIX_LABEL).toBe("Add pack appendix");
    expect(BLUEBEAM_MARKUP_APPENDIX_TITLE).toBe("Markup Summary");
    expect(BLUEBEAM_MARKUP_APPENDIX_LABEL).toBe("Bluebeam Markup Summary");
    expect(PACK_APPENDIX_ADDED_MESSAGE).toBe("Pack appendix added.");
    expect(shortContentSha256(`${"ab".repeat(32)}`)).toBe("abababababab");
    const proved = visiblePackProof([{
      title: "Markup Summary",
      sourceId: "upload:abc",
      fetchedAt: "2026-10-02T04:00:00.000Z",
      contentHash: "ab".repeat(32),
      pageCites: [{ revisionId: "rev", revisionLabel: "A", page: "2", documentPageId: null, contentHash: null }],
    }]);
    expect(proved).toHaveLength(1);
    expect(visiblePackProof([{ ...proved[0]!, contentHash: "short" }])).toEqual([]);
    expect(viewSource()).toContain("packProofChrome");
    expect(viewSource()).toContain("PACK_PROOF_SOURCE_LABEL");
    expect(viewSource()).toContain("PACK_PROOF_FETCHED_LABEL");
    expect(viewSource()).toContain("<time");
    expect(viewSource()).not.toMatch(/\battached\b/i);
    const copy = [
      PACK_APPENDIX_FILE_LABEL,
      ADD_PACK_APPENDIX_LABEL,
      BLUEBEAM_MARKUP_APPENDIX_TITLE,
      PACK_APPENDIX_ADDED_MESSAGE,
      "Pack appendix added.",
    ].join("\n");
    expect(copy).not.toMatch(BANNED_COPY);
    const view = readFileSync("components/review/export-packet.tsx", "utf8");
    const copySource = `${view}\n${readFileSync("lib/review/exportPacketView.ts", "utf8")}\n${readFileSync("lib/review/bluebeamAppendix.ts", "utf8")}`;
    expect(view).toContain("ADD_PACK_APPENDIX_LABEL");
    expect(view).toContain("PACK_APPENDIX_FILE_LABEL");
    expect(view).toContain("BLUEBEAM_MARKUP_APPENDIX_LABEL");
    expect(copySource).toContain(ADD_PACK_APPENDIX_LABEL);
    expect(copySource).toContain(PACK_APPENDIX_FILE_LABEL);
    expect(copySource).toContain(BLUEBEAM_MARKUP_APPENDIX_LABEL);
    expect(view).not.toContain("Add pack chapter appendix");
    expect(view).not.toMatch(/Add pack appendix[\s\S]*Add pack chapter|name="kind"[^>]*>\s*<option[^>]*>\s*Pack chapter/);
    expect(copySource).not.toMatch(BANNED_COPY);
    expect(readFileSync("lib/review/bluebeamAppendix.ts", "utf8")).not.toMatch(/S3Client|public-read|PutObjectCommand|new S3/);
    expect(readFileSync("lib/review/bluebeamAppendix.ts", "utf8")).toMatch(/writePacketBytes|ObjectStore/);
  });

  it("binds the appendix to the selected accepted fact page", () => {
    const fact = { subjectKey: "proposed-fact:excavation", decision: "ACCEPTED" as const, summary: "excavation", evidence: [{ revisionId: "rev", revisionLabel: "A", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }] };
    const pinned = { revisionId: "rev", revisionLabel: "A", page: "1", documentPageId: null, contentHash: null };
    expect(appendixFactBinding([fact], { key: fact.subjectKey, decision: "ACCEPTED" })).toEqual({
      subjectKey: fact.subjectKey,
      pageCites: [pinned],
    });
    expect(appendixFactBinding([fact], null)).toEqual({ subjectKey: fact.subjectKey, pageCites: [pinned] });
    expect(appendixFactBinding([{ ...fact, evidence: [] }], { key: fact.subjectKey, decision: "ACCEPTED" }).pageCites).toEqual([]);
    expect(appendixFactBinding([fact], { key: "other", decision: "DISMISSED" })).toEqual({ subjectKey: "", pageCites: [] });
  });

  it("reads page cites from a markup summary export", () => {
    expect(markupSummaryPageCites("Markup Summary\nPage: 2\nPage: 14\nPage: 2")).toEqual(["2", "14"]);
    expect(markupSummaryPageCites("Page Label: C-101\nPage: 3")).toEqual(["C-101", "3"]);
    expect(markupSummaryPageCites("Page Label,Subject,Comment\nC-101,Cloud,Verify invert\n3,Text,See detail\nC-101,Callout,Again")).toEqual(["C-101", "3"]);
    expect(markupSummaryPageCites("Markup Summary\nNo pages listed")).toEqual([]);
  });

  it("attaches a markup summary PDF to an accepted pack with provenance in the object store", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts.dozer.id },
    }, repository, clock);
    const before = await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    const pdf = markupPdf();
    const fetchedAt = new Date("2026-10-02T04:00:00.000Z");

    const packet = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
      kind: "bluebeam-markup",
    }, repository, objects, () => fetchedAt);

    const contentHash = createHash("sha256").update(pdf).digest("hex");
    expect(packet.decisionIds).toEqual([accepted.id]);
    expect(packet.chapters).toBeUndefined();
    expect(packet.appendices).toEqual([{
      role: "bluebeam-markup",
      title: "Markup Summary",
      sourceId: "bb-summary-17",
      fetchedAt: fetchedAt.toISOString(),
      contentHash,
      storageKey: `export-packets/${project.id}/appendices/${contentHash}.pdf`,
      filename: "markup-summary.pdf",
      byteSize: pdf.length,
      pageCites: outOfRangePages(project.revisionId),
    }]);
    expect(packet.contentHash).not.toBe(before.contentHash);
    expect(packet.contentHash).toBe(packetContentHash(packet));
    expect(JSON.parse(canonicalPacketBytes(packet).toString("utf8")).chapters).toBeUndefined();
    expect(await objects.get(packet.appendices![0]!.storageKey)).toEqual(pdf);
    expect(repository.exportPacketChapters[0]).toMatchObject({
      sourceId: "bb-summary-17",
      fetchedAt,
      contentHash,
      pageCites: outOfRangePages(project.revisionId),
      reviewDecisionIds: [accepted.id],
    });
    expect(repository.emailSends).toHaveLength(0);

    const source = await getEmailDraftSource("org_a", project.id, repository);
    expect(source.ready).toBe(true);
    if (!source.ready) return;
    expect(source.appendices).toEqual([{
      title: "Markup Summary",
      filename: "markup-summary.pdf",
      sourceId: "bb-summary-17",
      fetchedAt: fetchedAt.toISOString(),
      contentHash,
      pageCites: outOfRangePages(project.revisionId),
    }]);
    expect(source.exportPacketId).toBe(repository.exportPackets.at(-1)?.id);
    const draft = await recordEmailSend("org_a", project.id, {
      recipients: "pm@example.com",
      subject: "I-95 Bridge — approved facts pack",
      body: defaultEmailBody("I-95 Bridge"),
      actorId: "Alex Chen",
      exportPacketId: source.exportPacketId,
      status: "DRAFT",
    }, repository, clock);
    expect(draft.status).toBe("DRAFT");
    expect(draft.exportPacketId).toBe(source.exportPacketId);
    expect(repository.emailSends).toHaveLength(1);
    const stored = JSON.parse(repository.exportPackets.at(-1)!.payload.toString("utf8")) as { appendices: Array<{ pageCites: Array<{ revisionId: string; page: string }> }> };
    expect(stored.appendices[0]?.pageCites).toEqual(outOfRangePages(project.revisionId));
    expect(stored.appendices[0]?.pageCites.every((cite) => typeof cite !== "string")).toBe(true);
  });

  it("re-attaches a markup summary whose stored cites are bare page strings", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const pdf = markupPdf();
    const fetchedAt = new Date("2026-10-02T04:00:00.000Z");
    await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
    }, repository, objects, () => fetchedAt);

    const stored = repository.exportPackets.at(-1)!;
    const payload = JSON.parse(stored.payload.toString("utf8")) as { appendices: Array<{ pageCites: unknown }> };
    payload.appendices[0]!.pageCites = ["2", "14"];
    stored.payload = Buffer.from(JSON.stringify(payload));
    stored.contentHash = "f".repeat(64);
    repository.exportPacketChapters[0]!.pageCites = [];
    repository.exportPacketChapters[0]!.legacyPageLabels = ["2", "14"];

    await expect(currentApprovedChangePacket("org_a", project.id, repository)).rejects.toThrow(/Re-attach this appendix/);

    const again = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-summary-17",
    }, repository, objects, () => new Date("2026-10-02T05:00:00.000Z"));
    expect(again.appendices?.[0]?.pageCites).toEqual(outOfRangePages(project.revisionId));
    expect(repository.exportPacketChapters[0]?.legacyPageLabels).toEqual([]);
    const reloaded = await currentApprovedChangePacket("org_a", project.id, repository);
    expect(reloaded.appendices?.[0]?.pageCites).toEqual(again.appendices?.[0]?.pageCites);
  });

  it("keeps a pack without an appendix on the previous content hash", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const chapter = await attachAccPdfChapter("org_a", project.id, {
      bytes: Buffer.from("%PDF-1.4\nACC RFI fixture\n%%EOF"),
      filename: "rfi.pdf",
      mimeType: "application/pdf",
      sourceId: "acc-doc-1",
    }, repository, objects, clock);
    expect(chapter.appendices).toBeUndefined();
    expect(chapter.chapters).toHaveLength(1);
    const again = await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    expect(again.contentHash).toBe(chapter.contentHash);
    expect(again.appendices).toBeUndefined();
    const raw = JSON.parse(canonicalPacketBytes(again).toString("utf8")) as Record<string, unknown>;
    expect(raw.appendices).toBeUndefined();
    expect(Object.keys(raw)).toEqual(["kind", "version", "projectId", "note", "decisionIds", "changes", "chapters"]);
  });

  it("stores a CSV export and an upload marker when the source id is blank", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, sequencedClock());
    const csv = Buffer.from("Page Label,Subject\nC-101,Cloud\n3,Text\n");
    const packet = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: csv,
      filename: "../secret/summary.csv",
      mimeType: "text/csv",
      sourceId: " ",
    }, repository, objects, () => new Date("2026-10-02T04:30:00.000Z"));
    const contentHash = createHash("sha256").update(csv).digest("hex");
    expect(packet.appendices?.[0]).toMatchObject({
      sourceId: `upload:${contentHash}`,
      filename: "summary.csv",
      storageKey: `export-packets/${project.id}/appendices/${contentHash}.csv`,
      pageCites: [
        unpinnedMarkup(project.revisionId, "C-101", "sheet not matched"),
        unpinnedMarkup(project.revisionId, "3", "page not in Rev A"),
      ],
    });
    const appendix = packet.appendices![0]!;
    expect(packProofChrome({
      title: appendix.title,
      sourceId: appendix.sourceId,
      fetchedAt: appendix.fetchedAt,
      contentHash: appendix.contentHash,
      pageCites: appendix.pageCites,
    })).toEqual({
      title: "Bluebeam Markup Summary",
      sourceId: `upload:${contentHash}`,
      fetchedAt: "2026-10-02T04:30:00.000Z",
      sha256: contentHash.slice(0, 12),
      pageCites: [
        unpinnedMarkup(project.revisionId, "C-101", "sheet not matched"),
        unpinnedMarkup(project.revisionId, "3", "page not in Rev A"),
      ],
    });
    expect(await objects.get(appendix.storageKey)).toEqual(csv);
  });

  it.each(["DISMISSED", "FLAGGED"] as const)("rejects a %s decision and stores nothing", async (decision) => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    const recorded = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision,
      reason: "Needs another look.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const pdf = markupPdf();
    await expect(attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-1",
      subjectKey: recorded.subjectKey,
    }, repository, objects, clock)).rejects.toMatchObject({
      message: "Only an approved change can be exported.",
    });
    expect(repository.exportPacketChapters).toHaveLength(0);
    expect(repository.exportPackets).toHaveLength(0);
    expect(repository.emailSends).toHaveLength(0);
    expect(await objects.exists(`export-packets/${project.id}/appendices/${createHash("sha256").update(pdf).digest("hex")}.pdf`)).toBe(false);
  });

  it("rejects a pending change and a summary with no page cite before storing bytes", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    await expect(attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: markupPdf(),
      filename: "markup.pdf",
      mimeType: "application/pdf",
    }, repository, objects, clock)).rejects.toMatchObject({ message: EXPORT_BLOCKED_MESSAGE });
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await expect(attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: markupPdf(),
      filename: "markup.pdf",
      mimeType: "application/pdf",
      subjectKey: `proposed-fact:${facts.loader.id}`,
    }, repository, objects, clock)).rejects.toMatchObject({
      message: "Only an approved change can be exported.",
    });
    const bare = buildTextPdf(["Markup Summary", "No pages listed"]);
    const bound = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: bare,
      filename: "markup.pdf",
      mimeType: "application/pdf",
    }, repository, objects, clock);
    expect(bound.appendices?.[0]?.pageCites).toEqual([expect.objectContaining({
      revisionId: project.revisionId,
      revisionLabel: "A",
      page: "1",
      contentHash: "a".repeat(64),
    })]);
    expect(typeof bound.appendices?.[0]?.pageCites[0]).toBe("object");
    expect(repository.emailSends).toHaveLength(0);
    for (const item of facts.trench.evidence) item.pageNumber = 0;
    const stillBare = buildTextPdf(["Markup Summary", "No page on the fact"]);
    await expect(attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: stillBare,
      filename: "markup.pdf",
      mimeType: "application/pdf",
    }, repository, objects, clock)).rejects.toMatchObject({
      message: PACK_CITE_UNPINNED_MESSAGE,
    });
    expect(await objects.exists(`export-packets/${project.id}/appendices/${createHash("sha256").update(stillBare).digest("hex")}.pdf`)).toBe(false);
    await expect(attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: Buffer.from("notes"),
      filename: "notes.txt",
      mimeType: "text/plain",
    }, repository, objects, clock)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.emailSends).toHaveLength(0);
  });

  it("leaves an appendix off the next pack after approval is superseded", async () => {
    const { repository, project, facts } = await scaffold();
    const objects = objectStore();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    const pumpDecision = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.pump.id },
    }, repository, clock);
    await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: markupPdf(),
      filename: "markup.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-both",
    }, repository, objects, () => new Date("2026-10-02T05:00:00.000Z"));
    await recordReviewDecision("org_a", project.id, "pm-2", {
      decision: "DISMISSED",
      reason: "Superseded on site.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);

    const exported = await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    expect(exported.decisionIds).toEqual([pumpDecision.id]);
    expect(exported.appendices).toBeUndefined();
    expect(exported.chapters).toBeUndefined();

    const again = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: markupPdf(),
      filename: "markup.pdf",
      mimeType: "application/pdf",
      sourceId: "bb-both",
    }, repository, objects, () => new Date("2026-10-02T06:00:00.000Z"));
    expect(again.decisionIds).toEqual([pumpDecision.id]);
    expect(again.appendices?.[0]).toMatchObject({
      sourceId: "bb-both",
      fetchedAt: "2026-10-02T05:00:00.000Z",
      pageCites: outOfRangePages(project.revisionId),
    });
    expect(repository.exportPacketChapters).toHaveLength(1);
    expect(repository.exportPacketChapters[0]?.reviewDecisionIds).toEqual([pumpDecision.id]);
    expect(repository.emailSends).toHaveLength(0);
  });

  it("pins a markup page inside the revision and maps a stored sheet number", async () => {
    const { repository, project, facts } = await scaffold({ pageCount: 3 });
    const objects = objectStore();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, sequencedClock());
    const storedRevision = await repository.getRevision("org_a", project.revisionId);
    const sheetPage = storedRevision?.pages.find((page) => page.pageNumber === 2);
    if (!sheetPage) throw new Error("Missing page 2");
    (sheetPage as { sheetNumber?: string }).sheetNumber = "C-101";
    const pdf = buildTextPdf(["Markup Summary", "Page Label: C-101", "Page: 14", "Page Label: A-201"]);
    const packet = await attachBluebeamMarkupAppendix("org_a", project.id, {
      bytes: pdf,
      filename: "markup-summary.pdf",
      mimeType: "application/pdf",
    }, repository, objects, () => new Date("2026-10-02T04:00:00.000Z"));
    expect(packet.appendices?.[0]?.pageCites).toEqual([
      pinnedPage(project.revisionId, "2", sheetPage.id),
      unpinnedMarkup(project.revisionId, "14", "page not in Rev A"),
      unpinnedMarkup(project.revisionId, "A-201", "sheet not matched"),
    ]);
    const cites = packet.appendices?.[0]?.pageCites ?? [];
    expect(cites.filter((cite) => "page" in cite && cite.page === "C-101")).toEqual([]);
    expect(JSON.stringify(cites)).not.toContain("p. C-101");
    expect(JSON.stringify(cites)).not.toContain("\"page\":\"14\"");
  });
});

function viewSource() {
  return [
    readFileSync("components/review/export-packet.tsx", "utf8"),
    readFileSync("components/review/pack-proof.tsx", "utf8"),
    readFileSync("components/review/draft-email.tsx", "utf8"),
  ].join("\n");
}

function markupPdf() {
  return buildTextPdf(["Markup Summary", "Page: 2", "Page: 14", "Page: 2"]);
}

function objectStore() {
  const root = mkdtempSync(path.join(tmpdir(), "bluebeam-appendix-"));
  roots.push(root);
  return new LocalObjectStore(root);
}

async function scaffold(options?: { pageCount?: number }) {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
  const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Drainage Plan" });
  const revision = await repository.createRevision({
    documentId: document!.id,
    revisionLabel: "A",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    byteSize: 10,
    sha256: "a".repeat(64),
    storageKey: "revisions/a.pdf",
    status: "PROCESSED",
    pages: Array.from({ length: options?.pageCount ?? 1 }, (_, index) => ({
      pageNumber: index + 1,
      text: index === 0 ? [trench, dozer, pump, loader].join("\n") : `Page ${index + 1}`,
      textSha256: `${index % 10}`.repeat(64),
    })),
  });
  const stored = await propose(repository, revision.id, [
    equipmentFact(trench, "CAT 336"),
    equipmentFact(dozer, "dozer"),
    equipmentFact(pump, "pump"),
    equipmentFact(loader, "loader"),
  ]);
  return {
    repository,
    project: { id: project.id, documentId: document!.id, revisionId: revision.id },
    facts: {
      trench: stored[0]!,
      dozer: stored[1]!,
      pump: stored[2]!,
      loader: stored[3]!,
    },
  };
}

async function propose(
  repository: MemoryRepository,
  documentRevisionId: string,
  facts: Array<{ factType: "equipment_requirement"; payload: Record<string, string | null>; excerpt: string }>,
) {
  const revision = await repository.getRevision("org_a", documentRevisionId);
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  if (!queued || !revision) throw new Error("Missing extraction run");
  await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
  });
  await repository.commitProposedFacts({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "RUNNING",
    completedAt: new Date("2026-09-30T18:00:00.000Z"),
    facts: facts.map((fact) => ({
      factType: fact.factType,
      payload: fact.payload,
      evidence: [{
        documentPageId: revision.pages[0]!.id,
        pageNumber: 1,
        excerpt: fact.excerpt,
        startOffset: 0,
        endOffset: fact.excerpt.length,
      }],
    })),
  });
  return repository.proposedFacts.filter((fact) => fact.extractionRunId === queued.id);
}

function equipmentFact(excerpt: string, equipment: string) {
  return {
    factType: "equipment_requirement" as const,
    excerpt,
    payload: { equipment, statement: excerpt, modality: "asserted" },
  };
}

function pinnedPage(revisionId: string, page: string, documentPageId: string | null = null) {
  return {
    revisionId,
    revisionLabel: "A",
    page,
    documentPageId,
    contentHash: "a".repeat(64),
  };
}

function unpinnedMarkup(revisionId: string, label: string, reason: string) {
  const numeric = /^[1-9]\d*$/.test(label);
  return {
    status: "Unpinned" as const,
    label,
    display: numeric ? label : `Sheet ${label}`,
    reason,
    revisionId,
    revisionLabel: "A",
  };
}

function outOfRangePages(revisionId: string) {
  return [
    unpinnedMarkup(revisionId, "2", "page not in Rev A"),
    unpinnedMarkup(revisionId, "14", "page not in Rev A"),
  ];
}

function sequencedClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 30, 12, tick++));
}
