import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeReview } from "@/components/review/change-review";
import type { AttentionItemDto } from "@/lib/review/dto";
import { decidedRowChrome } from "./changeRow";
import {
  ACC_CHAPTER_FILE_LABEL,
  ACC_EXPORT_CHAPTER_TITLE,
  ADD_ACC_EXPORT_LABEL,
  ADD_PACK_APPENDIX_LABEL,
  APPENDIX_ON_ACCEPTED_PACK_ONLY,
  BLUEBEAM_MARKUP_APPENDIX_LABEL,
  DESK_EMPTY_MISSING_EVIDENCE,
  DESK_EMPTY_NO_OPEN_CHANGES,
  DESK_EMPTY_NO_SELECTION,
  EXPORT_BLOCKED_MESSAGE,
  PACK_APPENDIX_FILE_LABEL,
  RFI_PDF_CHAPTER_TITLE,
} from "./exportPacketView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() { return undefined; } }),
}));

const openItem = {
  severity: "high",
  disposition: "material_change",
  rule: "quantity.changed",
  reason: "Quantity changed.",
  finding: {
    subjectKey: "revision-change:open",
    documentTitle: "Catch basins",
    revisionLabel: "Rev A → Rev B",
    label: "catch basins: 16 EA",
    detail: "MODIFIED",
    evidence: [],
    material: true,
    basis: "numeric",
    assessment: null,
    before: null,
    after: null,
    sources: [],
    currentDecision: null,
    subject: {
      type: "revision_change",
      baseRevisionId: "base",
      revisedRevisionId: "revised",
      changeType: "MODIFIED",
      beforeProposedFactId: null,
      afterProposedFactId: null,
    },
  },
} as AttentionItemDto;

const acceptedFinding = {
  subjectKey: "proposed-fact:excavation",
  documentTitle: "Earthworks specification",
  revisionLabel: "Rev 04",
  label: "excavation: 1250 CY",
  subject: { type: "proposed_fact" as const },
  before: null,
  after: { category: "quantity" as const, evidence: [{ pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }] },
  evidence: [],
  currentDecision: { decision: "ACCEPTED" },
};

describe("changes desk chrome", () => {
  it("locks PE Desk export labels and empty-state copy", () => {
    expect(ADD_ACC_EXPORT_LABEL).toBe("Add pack chapter");
    expect(ACC_EXPORT_CHAPTER_TITLE).toBe("ACC export");
    expect(RFI_PDF_CHAPTER_TITLE).toBe("RFI PDF");
    expect(ACC_CHAPTER_FILE_LABEL).toBe("File: PDF");
    expect(ADD_PACK_APPENDIX_LABEL).toBe("Add pack appendix");
    expect(BLUEBEAM_MARKUP_APPENDIX_LABEL).toBe("Bluebeam Markup Summary");
    expect(PACK_APPENDIX_FILE_LABEL).toBe("File: PDF");
    expect(APPENDIX_ON_ACCEPTED_PACK_ONLY).toBe("Appendix on accepted pack only");
    expect(DESK_EMPTY_NO_OPEN_CHANGES).toBe("No open changes");
    expect(DESK_EMPTY_NO_SELECTION).toBe("Select a change or fact to view evidence.");
    expect(DESK_EMPTY_MISSING_EVIDENCE).toBe("No linked excerpt for this item.");
    expect(EXPORT_BLOCKED_MESSAGE).toBe("Approve at least one change to export.");
  });

  it("hides export while a review is open and keeps provenance on decided rows", () => {
    const blocked = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_demo_review",
      uploadHref: "/projects/project_demo_review?view=documents",
      items: [openItem],
      approved: [{
        subjectKey: acceptedFinding.subjectKey,
        decision: "ACCEPTED",
        summary: acceptedFinding.label,
        evidence: [{ revisionId: "rev", revisionLabel: "A", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
      }],
      decided: decidedRowChrome([acceptedFinding]),
    }));
    expect(blocked).toContain("Finish open reviews before exporting.");
    expect(blocked).not.toContain("Export approved pack");
    expect(blocked).toContain("Earthworks specification");
    expect(blocked).toContain("excavation: 1250 CY");
    expect(blocked).toContain("p. 1");
    expect(blocked).toContain("Needs review");
    expect(blocked).toContain("Accepted today");
    expect(blocked).toContain("Rejected today");
    expect(blocked).toContain("AI-suggested");
    expect(blocked).toContain("Accepted facts become project truth. AI suggestions never bypass human review.");
    expect(blocked).not.toMatch(/>Approved</);
    expect(blocked).not.toContain("Avg confidence");

    const open = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_demo_review",
      uploadHref: "/projects/project_demo_review?view=documents",
      items: [],
      approved: [{
        subjectKey: acceptedFinding.subjectKey,
        decision: "ACCEPTED",
        summary: acceptedFinding.label,
        evidence: [{ revisionId: "rev", revisionLabel: "A", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
      }],
      decided: decidedRowChrome([acceptedFinding]),
    }));
    expect(open).toContain("Export approved pack");
    expect(open).toContain("Appendix on accepted pack only");
    expect(open).toContain("Earthworks specification · Rev 04");
    expect(open).toContain("QUANTITY");
    expect(open).not.toContain("AI-suggested");
    expect(open).toContain("Accepted facts become project truth. AI suggestions never bypass human review.");
    expect(open).toContain("name=\"subjectKey\" value=\"proposed-fact:excavation\"");
    expect(open).toContain(">Rev A · p. 1<");
    expect(open).not.toContain("This accepted fact has no page cite.");
    expect(open).not.toContain("name=\"page");
  });

  it("blocks appendix attach when the selected accepted fact has no page cite", () => {
    const markup = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_demo_review",
      uploadHref: "/projects/project_demo_review?view=documents",
      items: [],
      approved: [{
        subjectKey: acceptedFinding.subjectKey,
        decision: "ACCEPTED",
        summary: acceptedFinding.label,
        evidence: [],
      }],
      decided: decidedRowChrome([{ ...acceptedFinding, after: { category: "quantity", evidence: [] }, evidence: [] }]),
    }));
    expect(markup).toContain("This accepted fact has no page cite.");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).not.toContain("name=\"subjectKey\"");
  });
});
