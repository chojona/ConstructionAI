import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackProofList } from "@/components/review/pack-proof";
import type { ReviewDecisionRecord } from "@/lib/domain/types";
import {
  APPROVED_CHANGE_PACKET_KIND,
  APPROVED_CHANGE_PACKET_NOTE,
  APPROVED_CHANGE_PACKET_VERSION,
  buildApprovedChangePacket,
  packetFromStored,
} from "./exportPacket";
import {
  LETTING_NOTICE_NOT_EVIDENCE,
  bindMarkupPageCites,
  canonicalPackPageCite,
  deskPackFiles,
  deskPackFilesFromPacket,
  factPageCites,
  isLettingNotice,
  isPinnedEvidenceCite,
  legacyPageCiteMessage,
  packPageCiteLabel,
  pinLegacyPageCites,
  readStoredPageCites,
  replacementPageCites,
  storedPageCiteStrings,
  type PackPageCite,
} from "./exportPacketView";
import type { ProjectFinding } from "./findings";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function pin(revisionId: string, revisionLabel: string, page: string, documentPageId: string | null, contentHash: string | null): PackPageCite {
  return { revisionId, revisionLabel, page, documentPageId, contentHash };
}

function unpinned(label: string, display: string, reason: string, revisionId: string | null, revisionLabel: string | null) {
  return { status: "Unpinned" as const, label, display, reason, revisionId, revisionLabel };
}

describe("pack page cites", () => {
  it("rejects a page number, URL, document name, or floating revision as a pack cite", () => {
    expect(canonicalPackPageCite("2")).toBeNull();
    expect(canonicalPackPageCite("C-101")).toBeNull();
    expect(canonicalPackPageCite("Drainage Plan")).toBeNull();
    expect(canonicalPackPageCite("https://dot.ny.gov/sheet/2")).toBeNull();
    expect(canonicalPackPageCite({ page: "2" })).toBeNull();
    expect(canonicalPackPageCite({ documentTitle: "Drainage Plan", page: "2" })).toBeNull();
    expect(canonicalPackPageCite({ revisionId: "current", revisionLabel: "A", page: "2", documentPageId: null, contentHash: null })).toBeNull();
    expect(canonicalPackPageCite({ revisionId: "latest", revisionLabel: "B", page: "2", documentPageId: null, contentHash: null })).toBeNull();
    expect(canonicalPackPageCite({ revisionId: "rev_a", revisionLabel: "current", page: "2", documentPageId: null, contentHash: null })).toBeNull();
    expect(canonicalPackPageCite({ revisionId: "rev_a", revisionLabel: "A", page: "https://example.com/2", documentPageId: null, contentHash: null })).toBeNull();
    expect(isPinnedEvidenceCite({ pageNumber: 4 })).toBe(false);
    expect(isPinnedEvidenceCite({ pageNumber: 4, documentTitle: "Drainage Plan" })).toBe(false);
    expect(isPinnedEvidenceCite({ pageNumber: 4, url: "https://dot.ny.gov/plans" })).toBe(false);
    expect(isPinnedEvidenceCite({ pageNumber: 4, revisionId: "current" })).toBe(false);
    expect(isPinnedEvidenceCite({ pageNumber: 4, revisionId: "latest", documentPageId: "page_a" })).toBe(false);
    expect(isPinnedEvidenceCite({ pageNumber: 4, revisionId: "rev_a" })).toBe(true);
    expect(isPinnedEvidenceCite({ pageNumber: 4, documentPageId: "page_a" })).toBe(true);
    expect(factPageCites([{ pageNumber: 4 }])).toEqual([]);
    expect(storedPageCiteStrings(["2"])).toBeNull();
    expect(readStoredPageCites(["2"])).toBeNull();
    expect(readStoredPageCites(["C-101"])).toBeNull();
    const mixed = deskPackFiles([{
      title: "Markup Summary",
      sourceId: "bb-1",
      fetchedAt: "2026-10-02T00:00:00.000Z",
      contentHash: "ab".repeat(32),
      pageCites: ["2", "https://example.com/sheet", "Drainage Plan"],
    }])[0];
    expect(mixed?.pageCites).toEqual([]);
    expect(mixed?.citeNotice).toBeNull();
  });

  it("names legacy bare page cites and pins them to one revision", () => {
    const raw = ["2", "C-101"];
    const message = legacyPageCiteMessage(raw);
    expect(message).toContain("Re-attach this appendix");
    expect(message).toContain("Pages: 2, C-101");
    expect(pinLegacyPageCites(raw, { revisionId: "rev_a", revisionLabel: "A", contentHash: hashA })).toEqual([
      JSON.stringify(pin("rev_a", "A", "2", null, hashA)),
      JSON.stringify(pin("rev_a", "A", "C-101", null, hashA)),
    ]);
    expect(pinLegacyPageCites(["https://example.com/2"], { revisionId: "rev_a", revisionLabel: "A" })).toBeNull();
    expect(replacementPageCites(raw, [pin("rev_a", "A", "2", null, hashA), pin("rev_a", "A", "C-101", null, hashA)])).toEqual([
      JSON.stringify(pin("rev_a", "A", "2", null, hashA)),
      JSON.stringify(pin("rev_a", "A", "C-101", null, hashA)),
    ]);
    expect(replacementPageCites([JSON.stringify(pin("rev_a", "A", "2", null, hashA))], [pin("rev_a", "A", "9", null, hashA)])).toBeNull();
    const files = deskPackFiles([{
      title: "Markup Summary",
      sourceId: "bb-1",
      fetchedAt: "2026-10-02T00:00:00.000Z",
      contentHash: "ab".repeat(32),
      pageCites: raw,
    }]);
    expect(files[0]?.pageCites).toEqual([]);
    expect(files[0]?.citeNotice).toBe(message);
    const html = renderToStaticMarkup(createElement(PackProofList, { files }));
    expect(html).toContain("Re-attach this appendix");
    expect(html).toContain("Pages: 2, C-101");
    expect(html).not.toContain(">p. 2<");
  });

  it("pins fact page cites to the accepted revision and keeps that pin when another revision exists", () => {
    const accepted = pin("rev_a", "A", "3", "page_a", hashA);
    expect(factPageCites([{
      revisionId: "rev_a",
      revisionLabel: "A",
      pageNumber: 3,
      documentPageId: "page_a",
      contentHash: hashA,
    }, {
      revisionId: "rev_b",
      revisionLabel: "B",
      pageNumber: 9,
      documentPageId: "page_b",
      contentHash: hashB,
    }])).toEqual([accepted, pin("rev_b", "B", "9", "page_b", hashB)]);
    expect(factPageCites([{ revisionId: "rev_a", revisionLabel: "A", pageNumber: 3, documentPageId: "page_a", contentHash: hashA }])).toEqual([accepted]);
    expect(accepted.revisionId).not.toBe("rev_b");
    expect(Object.keys(accepted).slice(0, 3)).toEqual(["revisionId", "revisionLabel", "page"]);
  });

  it("keeps one cite when the same revision and page are listed twice", () => {
    const evidence = {
      revisionId: "rev_a",
      revisionLabel: "A",
      pageNumber: 3,
      documentPageId: "page_a",
      contentHash: hashA,
      documentTitle: "Drainage Plan",
    };
    expect(factPageCites([evidence, { ...evidence }])).toEqual([{
      ...pin("rev_a", "A", "3", "page_a", hashA),
      documentTitle: "Drainage Plan",
    }]);
  });

  it("pins an in-range markup page and leaves out-of-range, sheet, and unmatched labels unpinned", () => {
    const onA = pin("rev_a", "A", "1", "page_a1", hashA);
    const onB = pin("rev_b", "B", "4", "page_b1", hashB);
    const revA = {
      revisionId: "rev_a",
      revisionLabel: "A",
      contentHash: hashA,
      pages: [
        { id: "page_a1", pageNumber: 1 },
        { id: "page_a2", pageNumber: 2 },
        { id: "page_a3", pageNumber: 3 },
      ],
    };
    const revB = {
      revisionId: "rev_b",
      revisionLabel: "B",
      contentHash: hashB,
      pages: [{ id: "page_b1", pageNumber: 1 }],
    };
    expect(bindMarkupPageCites(["2"], [onA], [revA])).toEqual([
      pin("rev_a", "A", "2", "page_a2", hashA),
    ]);
    const outOfRange = bindMarkupPageCites(["14"], [onA], [revA]);
    expect(outOfRange).toEqual([unpinned("14", "p. 14", "not in Rev A", "rev_a", "A")]);
    expect(outOfRange[0]).not.toHaveProperty("page");
    expect(outOfRange[0]).not.toHaveProperty("documentPageId");

    const sheets = bindMarkupPageCites(["C-101", "A-201", "S-3.1"], [onA], [revA]);
    expect(sheets).toEqual([
      unpinned("C-101", "Sheet C-101", "not matched", "rev_a", "A"),
      unpinned("A-201", "Sheet A-201", "not matched", "rev_a", "A"),
      unpinned("S-3.1", "Sheet S-3.1", "not matched", "rev_a", "A"),
    ]);
    expect(JSON.stringify(sheets)).not.toContain("\"page\":\"C-101\"");
    expect(JSON.stringify(sheets)).not.toContain("p. C-101");

    const mapped = bindMarkupPageCites(["c-101"], [onA], [{
      ...revA,
      pages: revA.pages.map((page) => page.pageNumber === 2 ? { ...page, sheetNumber: "C-101" } : page),
    }]);
    expect(mapped).toEqual([pin("rev_a", "A", "2", "page_a2", hashA)]);
    expect(mapped[0]).not.toMatchObject({ page: "C-101" });

    const unmatched = bindMarkupPageCites(["9", "14"], [onA, onB], [revA, revB]);
    expect(unmatched).toEqual([
      unpinned("9", "p. 9", "not in Rev A or Rev B", null, null),
      unpinned("14", "p. 14", "not in Rev A or Rev B", null, null),
    ]);
    expect(unmatched).not.toEqual([onA, onB]);

    expect(bindMarkupPageCites(["2"], [onA, onB], [revA, revB])).toEqual([
      pin("rev_a", "A", "2", "page_a2", hashA),
    ]);
    expect(bindMarkupPageCites(["1"], [onA, onB], [revA, {
      ...revB,
      pages: [
        { id: "page_b1", pageNumber: 1 },
        { id: "page_b2", pageNumber: 2 },
        { id: "page_b3", pageNumber: 3 },
        { id: "page_b4", pageNumber: 4 },
      ],
    }])).toEqual([unpinned("1", "p. 1", "page not matched", null, null)]);
    expect(bindMarkupPageCites(["NYSDOT notice"], [onA], [revA])).toEqual([onA]);
    expect(bindMarkupPageCites([], [onA], [revA])).toEqual([onA]);

    const html = renderToStaticMarkup(createElement(PackProofList, {
      files: [{
        title: "Markup Summary",
        sourceId: "bb-1",
        fetchedAt: "2026-10-02T04:00:00.000Z",
        contentHash: "ab".repeat(32),
        pageCites: [pin("rev_a", "A", "2", "page_a2", hashA), pin("rev_a", "A", "C-101", null, hashA), ...sheets, ...outOfRange],
      }],
    }));
    expect(html).toContain("Rev A · p. 2");
    expect(html).toContain("Unpinned · Sheet C-101 · not matched");
    expect(html).not.toContain("sheet not matched");
    expect(html).toContain("Unpinned · p. 14 · not in Rev A");
    expect(html).toContain("data-pin-status=\"Unpinned\"");
    expect(html).not.toContain("p. C-101");
  });

  it("shows the document and revision once beside the page on pack proof chrome", () => {
    const stored = pin("rev_a", "Rev A", "2", null, hashA);
    expect(canonicalPackPageCite({ ...stored, documentTitle: "Drainage Plan" })).toEqual(stored);
    expect(JSON.stringify(canonicalPackPageCite({ ...stored, documentTitle: "Drainage Plan" }))).not.toContain("Drainage");
    const cite = { ...pin("rev_a", "A", "2", null, hashA), documentTitle: "Drainage Plan" };
    expect(packPageCiteLabel(cite)).toBe("Drainage Plan · Rev A · p. 2");
    expect(packPageCiteLabel({ ...stored, documentTitle: "Drainage Plan" })).toBe("Drainage Plan · Rev A · p. 2");
    expect(packPageCiteLabel({ ...pin("rev_c", "Revision C", "2", null, hashA), documentTitle: "Drainage Plan" })).toBe("Drainage Plan · Revision C · p. 2");
    expect(packPageCiteLabel(stored)).toBe("Unpinned");
    const files = deskPackFilesFromPacket({
      appendices: [{
        title: "Markup Summary",
        sourceId: "bb-1",
        fetchedAt: "2026-10-02T04:00:00.000Z",
        contentHash: "ab".repeat(32),
        pageCites: [pin("rev_a", "Rev A", "2", null, hashA), pin("rev_b", "Rev B", "4", null, hashB)],
      }],
      changes: [
        { document: { title: "Drainage Plan" }, revisions: [{ id: "rev_a" }], evidence: [{ revisionId: "rev_a" }] },
        { document: { title: "Special provisions" }, revisions: [{ id: "rev_b" }], evidence: [{ revisionId: "rev_b" }] },
      ],
    });
    expect(files.appendices[0]?.pageCites.map((item) => packPageCiteLabel(item))).toEqual([
      "Drainage Plan · Rev A · p. 2",
      "Special provisions · Rev B · p. 4",
    ]);
    const html = renderToStaticMarkup(createElement(PackProofList, { files: files.appendices }));
    expect(html).toContain("Drainage Plan · Rev A · p. 2");
    expect(html).toContain("Special provisions · Rev B · p. 4");
    expect(html).not.toContain("Rev Rev");
    expect(html).not.toContain(">p. 2<");
    expect(factPageCites([{
      revisionId: "rev_a",
      revisionLabel: "Rev A",
      pageNumber: 2,
      documentTitle: "Drainage Plan",
      documentPageId: null,
      contentHash: hashA,
    }])[0]?.documentTitle).toBe("Drainage Plan");
  });

  it("refuses a stored pack whose cite is only a page number", () => {
    expect(() => packetFromStored({
      contentHash: "c".repeat(64),
      payload: Buffer.from(JSON.stringify(packetBody({
        evidence: [{ pageNumber: 2 }],
      }))),
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
    })).toThrow(/could not be read/);
    expect(() => packetFromStored({
      contentHash: "c".repeat(64),
      payload: Buffer.from(JSON.stringify(packetBody({
        evidence: [{ revisionId: "rev_a", revisionLabel: "A", documentPageId: "page_a", pageNumber: 1, excerpt: "text", startOffset: 0, endOffset: 4 }],
        pageCites: ["2"],
      }))),
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
    })).toThrow(/Re-attach this appendix/);
  });

  it("does not export a letting notice as pack evidence", () => {
    expect(isLettingNotice("Letting Board")).toBe(true);
    expect(isLettingNotice("NYSDOT notice to contractors")).toBe(true);
    expect(isLettingNotice("Drainage Plan")).toBe(false);
    expect(() => buildApprovedChangePacket({
      projectId: "project_1",
      findings: [acceptedFinding("NYSDOT notice")],
      revisions: [{
        id: "rev_a",
        documentId: "document_1",
        documentTitle: "NYSDOT notice",
        revisionLabel: "A",
        revisionOrder: 1,
        sha256: hashA,
      }],
    })).toThrow(LETTING_NOTICE_NOT_EVIDENCE);
    const packet = buildApprovedChangePacket({
      projectId: "project_1",
      findings: [acceptedFinding("Drainage Plan")],
      revisions: [{
        id: "rev_a",
        documentId: "document_1",
        documentTitle: "Drainage Plan",
        revisionLabel: "A",
        revisionOrder: 1,
        sha256: hashA,
      }],
    });
    expect(packet.changes[0]?.evidence[0]).toMatchObject({
      revisionId: "rev_a",
      revisionLabel: "A",
      contentHash: hashA,
      pageNumber: 1,
    });
    expect(Object.keys(packet.changes[0]!.evidence[0]!).slice(0, 2)).toEqual(["revisionId", "revisionLabel"]);
  });
});

function packetBody(input: { evidence: unknown[]; pageCites?: unknown[] }) {
  return {
    kind: APPROVED_CHANGE_PACKET_KIND,
    version: APPROVED_CHANGE_PACKET_VERSION,
    projectId: "project_1",
    note: APPROVED_CHANGE_PACKET_NOTE,
    decisionIds: ["decision_1"],
    changes: [{
      subjectKey: "proposed-fact:fact_1",
      summary: "excavation",
      decisionId: "decision_1",
      decision: "ACCEPTED",
      reviewerId: "pm",
      approvedAt: "2026-10-02T00:00:00.000Z",
      reason: null,
      proposedFactId: "fact_1",
      changeType: null,
      document: { id: "document_1", title: "Drainage Plan" },
      revisions: [{ id: "rev_a", label: "A", role: "extracted" }],
      evidence: input.evidence,
    }],
    ...(input.pageCites ? {
      appendices: [{
        role: "bluebeam-markup",
        title: "Markup Summary",
        sourceId: "bb-1",
        fetchedAt: "2026-10-02T00:00:00.000Z",
        contentHash: "d".repeat(64),
        storageKey: "export-packets/project_1/appendices/markup.pdf",
        filename: "markup.pdf",
        byteSize: 10,
        pageCites: input.pageCites,
      }],
    } : {}),
  };
}

function acceptedFinding(documentTitle: string): ProjectFinding {
  const decision: ReviewDecisionRecord = {
    id: "decision_1",
    projectId: "project_1",
    subjectKind: "PROPOSED_FACT",
    subjectKey: "proposed-fact:fact_1",
    decision: "ACCEPTED",
    reviewerId: "pm",
    reason: null,
    proposedFactId: "fact_1",
    beforeProposedFactId: null,
    afterProposedFactId: null,
    baseRevisionId: null,
    revisedRevisionId: null,
    changeType: null,
    supersedesDecisionId: null,
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
  };
  return {
    subjectKey: decision.subjectKey,
    documentTitle,
    revisionLabel: "A",
    label: "equipment",
    detail: "Proposed by extraction",
    evidence: [{
      documentPageId: "page_1",
      pageNumber: 1,
      excerpt: "A CAT 336 excavator shall be used.",
      startOffset: 0,
      endOffset: 32,
      revisionId: "rev_a",
      revisionLabel: "A",
      documentTitle,
    }],
    material: null,
    basis: null,
    assessment: null,
    before: null,
    after: null,
    sources: [{ revisionId: "rev_a", revisionLabel: "A", role: "extracted" }],
    currentDecision: decision,
    subject: { type: "proposed_fact", proposedFactId: "fact_1" },
  };
}
