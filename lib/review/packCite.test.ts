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
  factPageCites,
  isLettingNotice,
  isPinnedEvidenceCite,
  packPageCiteLabel,
  readStoredPageCites,
  storedPageCiteStrings,
  type PackPageCite,
} from "./exportPacketView";
import type { ProjectFinding } from "./findings";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function pin(revisionId: string, revisionLabel: string, page: string, documentPageId: string | null, contentHash: string | null): PackPageCite {
  return { revisionId, revisionLabel, page, documentPageId, contentHash };
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
    expect(deskPackFiles([{
      title: "Markup Summary",
      sourceId: "bb-1",
      fetchedAt: "2026-10-02T00:00:00.000Z",
      contentHash: "ab".repeat(32),
      pageCites: ["2", "https://example.com/sheet", "Drainage Plan"],
    }])[0]?.pageCites).toEqual([]);
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

  it("binds markup page labels to the accepted revision and does not follow the latest revision", () => {
    const onA = pin("rev_a", "A", "1", "page_a", hashA);
    const onB = pin("rev_b", "B", "4", "page_b", hashB);
    expect(bindMarkupPageCites(["2", "14"], [onA])).toEqual([
      pin("rev_a", "A", "2", null, hashA),
      pin("rev_a", "A", "14", null, hashA),
    ]);
    expect(bindMarkupPageCites(["9", "14"], [onA, onB])).toEqual([onA, onB]);
    expect(bindMarkupPageCites(["1"], [onA, onB])).toEqual([onA]);
    expect(bindMarkupPageCites(["1"], [onA, { ...onB, page: "1" }])).toEqual([onA, { ...onB, page: "1" }]);
    expect(bindMarkupPageCites(["NYSDOT notice"], [onA])).toEqual([onA]);
    expect(bindMarkupPageCites([], [onA])).toEqual([onA]);
  });

  it("shows the revision label beside the page on pack proof chrome", () => {
    const cite = pin("rev_a", "A", "2", null, hashA);
    expect(packPageCiteLabel(cite)).toBe("Rev A · p. 2");
    const html = renderToStaticMarkup(createElement(PackProofList, {
      files: [{
        title: "Markup Summary",
        sourceId: "bb-1",
        fetchedAt: "2026-10-02T04:00:00.000Z",
        contentHash: "ab".repeat(32),
        pageCites: [cite],
      }],
    }));
    expect(html).toContain("Rev A · p. 2");
    expect(html).not.toContain(">p. 2<");
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
    })).toThrow(/could not be read/);
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
