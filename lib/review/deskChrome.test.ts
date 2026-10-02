import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeReview } from "@/components/review/change-review";
import type { AttentionItemDto } from "@/lib/review/dto";
import { decidedRowChrome } from "./changeRow";

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
  it("hides export while a review is open and keeps provenance on decided rows", () => {
    const blocked = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_demo_review",
      uploadHref: "/projects/project_demo_review?view=documents",
      items: [openItem],
      approved: [{
        subjectKey: acceptedFinding.subjectKey,
        decision: "ACCEPTED",
        summary: acceptedFinding.label,
        evidence: [{ revisionId: "rev", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
      }],
      decided: decidedRowChrome([acceptedFinding]),
    }));
    expect(blocked).toContain("Finish open reviews before exporting.");
    expect(blocked).not.toContain("Export approved pack");
    expect(blocked).toContain("Earthworks specification");
    expect(blocked).toContain("excavation: 1250 CY");
    expect(blocked).toContain("p. 1");
    expect(blocked).not.toMatch(/>Approved</);

    const open = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_demo_review",
      uploadHref: "/projects/project_demo_review?view=documents",
      items: [],
      approved: [{
        subjectKey: acceptedFinding.subjectKey,
        decision: "ACCEPTED",
        summary: acceptedFinding.label,
        evidence: [{ revisionId: "rev", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
      }],
      decided: decidedRowChrome([acceptedFinding]),
    }));
    expect(open).toContain("Export approved pack");
    expect(open).toContain("Earthworks specification · Rev 04");
    expect(open).toContain("name=\"subjectKey\" value=\"proposed-fact:excavation\"");
    expect(open).toContain(">p. 1<");
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
