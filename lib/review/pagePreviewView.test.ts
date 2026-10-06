import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeReview } from "@/components/review/change-review";
import { DecisionEvidence } from "@/components/review/decision-change-list";
import { PagePreview } from "@/components/review/page-preview";
import type { AttentionItemDto } from "@/lib/review/dto";
import type { DecidedRowChrome } from "./changeRow";
import { citePinStatus, formatCiteLabel } from "./citeLabel";
import { PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() { return undefined; } }),
}));

const cited = {
  severity: "high",
  disposition: "material_change",
  rule: "quantity.changed",
  reason: "Quantity changed.",
  finding: {
    subjectKey: "revision-change:open",
    documentTitle: "Catch basins",
    revisionLabel: "Rev B",
    label: "catch basins: 16 EA",
    detail: "MODIFIED",
    evidence: [],
    material: true,
    basis: "numeric",
    assessment: null,
    before: null,
    after: {
      category: "quantity",
      summary: "16 EA",
      evidence: [{
        documentPageId: "page_4",
        pageNumber: 4,
        excerpt: "Install 16 catch basins.",
        startOffset: 0,
        endOffset: 24,
        revisionId: "rev_cited",
        revisionLabel: "Rev B",
        documentTitle: "Catch basins",
      }],
    },
    sources: [],
    currentDecision: null,
    subject: {
      type: "revision_change",
      baseRevisionId: "base",
      revisedRevisionId: "rev_cited",
      changeType: "MODIFIED",
      beforeProposedFactId: null,
      afterProposedFactId: null,
    },
  },
} as AttentionItemDto;

const uncited = {
  ...cited,
  finding: { ...cited.finding, after: null, subjectKey: "revision-change:plain" },
} as AttentionItemDto;

function decidedRow(pageNumber: number | null, revisionId: string | null): DecidedRowChrome {
  return {
    key: "fact-1",
    decision: "ACCEPTED",
    title: "excavation: 1250 CY",
    documentTitle: "Earthworks specification",
    revisionLabel: "Rev 04",
    pageLabel: formatCiteLabel({
      documentTitle: "Earthworks specification",
      revisionLabel: "Rev 04",
      revisionId,
      page: pageNumber,
    }),
    pinStatus: citePinStatus({
      documentTitle: "Earthworks specification",
      revisionLabel: "Rev 04",
      revisionId,
      page: pageNumber,
    }),
    pageNumber,
    excerpt: pageNumber ? "Excavation quantity is 1,250 CY." : "",
    revisionId,
  };
}

describe("page preview rail", () => {
  it("shows the cited page under the excerpt and links to the revision", () => {
    const html = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_1",
      uploadHref: "/projects/project_1?view=documents",
      items: [cited],
    }));
    expect(html).toContain(">Catch basins · Rev B · p. 4<");
    expect(html).not.toContain(">p. 4<");
    expect(html).toContain("Install 16 catch basins.");
    expect(html).toContain("/api/projects/project_1/revisions/rev_cited/pages/4");
    expect(html).toContain('alt="Page 4"');
    expect(html).toContain('href="/revisions/rev_cited"');
    expect(html).toContain("Open full document");
    expect(html).toContain("Catch basins · Rev B · p. 4");
    expect(html).toContain("Why this needs review");
    expect(html).toContain("Quantity changed.");
    expect(html).toContain("QUANTITY");
    expect(html).toContain("MODIFIED");
    expect(html).toContain("AI-suggested");
    expect(html).toContain("Needs review");
    expect(html).toContain("Accepted today");
    expect(html).toContain("Rejected today");
    expect(html).toContain("Accepted facts become project truth. AI suggestions never bypass human review.");
    expect(html).not.toContain(PAGE_PREVIEW_UNAVAILABLE_MESSAGE);
    expect(html).not.toMatch(/Ask about this page|pdf-chat|ask the pdf|prompt box|Avg confidence|CONFLICT|Edit fact|Process new docs|DIMENSION|PRODUCT/i);
    expect(html).toContain('data-pin-status="Pinned"');
  });

  it("keeps Doc · Rev on the open rail when the lead chip is unpinned", () => {
    const lead = cited.finding.after;
    if (!lead) throw new Error("cited fixture is missing after evidence");
    const unpinned = {
      ...cited,
      finding: {
        ...cited.finding,
        subjectKey: "revision-change:unpinned",
        documentTitle: "Special provisions",
        revisionLabel: "Addendum 2",
        after: {
          ...lead,
          evidence: [{
            ...lead.evidence[0]!,
            revisionId: "",
            revisionLabel: "A",
            documentTitle: "Special provisions",
          }],
        },
      },
    } as AttentionItemDto;
    const html = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_1",
      uploadHref: "/projects/project_1?view=documents",
      items: [unpinned],
    }));
    expect(html).toContain(">Unpinned<");
    expect(html).toContain('data-pin-status="Unpinned"');
    expect(html).toContain("Special provisions · Rev A");
    expect(html).not.toContain("Special provisions · Rev A · p.");
    expect(html).not.toContain("Rev Rev");
  });

  it("shows the severity reason on first paint when decided facts are also listed", () => {
    const html = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_1",
      uploadHref: "/projects/project_1?view=documents",
      items: [cited],
      decided: [decidedRow(1, "rev_accepted")],
    }));
    expect(html).toContain("Why this needs review");
    expect(html).toContain("Quantity changed.");
    expect(html.indexOf("Why this needs review")).toBeLessThan(html.indexOf("page-preview"));
    expect(html).toContain("Catch basins · Rev B · p. 4");
    expect(html).toContain("Earthworks specification");
  });

  it("omits the review reason block when the severity reason is blank", () => {
    const html = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_1",
      uploadHref: "/projects/project_1?view=documents",
      items: [{ ...cited, reason: "   " }],
    }));
    expect(html).not.toContain("Why this needs review");
    expect(html).toContain("Catch basins · Rev B · p. 4");
  });

  it("keeps the existing empty copy when the fact has no page cite", () => {
    const html = renderToStaticMarkup(createElement(ChangeReview, {
      projectId: "project_1",
      uploadHref: "/projects/project_1?view=documents",
      items: [uncited],
    }));
    expect(html).toContain("Select a change or fact to view evidence.");
    expect(html).not.toContain("page-preview");
    expect(html).not.toContain("Open full document");
    expect(html).not.toContain(PAGE_PREVIEW_UNAVAILABLE_MESSAGE);
  });

  it("shows the unavailable copy without a blank page when the revision cannot be opened", () => {
    const html = renderToStaticMarkup(createElement(DecisionEvidence, {
      projectId: "project_1",
      row: decidedRow(2, null),
    }));
    expect(html).toContain(">Unpinned<");
    expect(html).toContain('data-pin-status="Unpinned"');
    expect(html).toContain("Earthworks specification · Rev 04");
    expect(html).not.toContain(">p. 2<");
    expect(html).toContain("Excavation quantity is 1,250 CY.");
    expect(html).toContain(PAGE_PREVIEW_UNAVAILABLE_MESSAGE);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("page-preview-scroll");

    const ready = renderToStaticMarkup(createElement(PagePreview, {
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 2,
    }));
    expect(ready).toContain("page-preview-scroll");
    const missing = renderToStaticMarkup(createElement(DecisionEvidence, {
      projectId: "project_1",
      row: decidedRow(null, null),
    }));
    expect(missing).not.toContain("page-preview");
    expect(missing).toContain("No linked excerpt for this item.");
  });
});