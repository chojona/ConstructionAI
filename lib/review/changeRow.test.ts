import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionChangeList, DecisionEvidence } from "@/components/review/decision-change-list";
import { UNPINNED_CITE_LABEL } from "./citeLabel";
import { changeEvidenceLead, changePageChip, changeRowTitle, decidedRowChrome, openRowChrome } from "./changeRow";

describe("change rows", () => {
  it("names a quantity change and its page", () => {
    const finding = {
      subject: { type: "revision_change", changeType: "MODIFIED" },
      before: { category: "quantity" as const, evidence: [{ pageNumber: 1 }] },
      after: { category: "quantity" as const, evidence: [{ pageNumber: 1 }] },
      evidence: [],
    };
    expect(changeRowTitle(finding)).toBe("Quantity changed");
    expect(changePageChip(finding)).toBe(UNPINNED_CITE_LABEL);
    expect(changeEvidenceLead(finding)).toEqual({ page: 1, excerpt: "No linked excerpt available.", revisionId: null, revisionLabel: null, documentTitle: null });
  });

  it("prefers the after excerpt for the evidence lead", () => {
    const finding = {
      subject: { type: "revision_change", changeType: "MODIFIED" },
      before: { category: "quantity" as const, evidence: [{ pageNumber: 2, excerpt: "before" }] },
      after: { category: "quantity" as const, evidence: [{ pageNumber: 3, excerpt: "after text" }] },
      evidence: [],
    };
    expect(changeEvidenceLead(finding)).toEqual({ page: 3, excerpt: "after text", revisionId: null, revisionLabel: null, documentTitle: null });
  });

  it("keeps document, revision, and page on accepted and rejected rows", () => {
    const shared = {
      subjectKey: "proposed-fact:excavation",
      label: "excavation: 1250 CY",
      documentTitle: "Special provisions",
      revisionLabel: "Rev A → Rev B",
      subject: { type: "revision_change" as const, changeType: "MODIFIED" as const },
      before: { category: "quantity" as const, evidence: [{ pageNumber: 1, excerpt: "Structural excavation 4200 CY." }] },
      after: { category: "quantity" as const, evidence: [{ pageNumber: 1, excerpt: "Structural excavation 5100 CY.", revisionId: "rev_b", revisionLabel: "Rev B", documentTitle: "Special provisions" }] },
      evidence: [],
    };
    const open = openRowChrome(shared);
    const [accepted] = decidedRowChrome([{ ...shared, currentDecision: { decision: "ACCEPTED" } }]);
    const [rejected] = decidedRowChrome([{ ...shared, currentDecision: { decision: "DISMISSED" } }]);
    expect(open).toEqual({
      documentTitle: "Special provisions",
      revisionLabel: "Rev A → Rev B",
      pageLabel: "Special provisions · Rev B · p. 1",
      pageNumber: 1,
      excerpt: "Structural excavation 5100 CY.",
      revisionId: "rev_b",
      sourceCitation: "Special provisions · Rev B · p. 1",
      badges: [
        { kind: "fact", label: "QUANTITY" },
        { kind: "change", label: "MODIFIED" },
      ],
    });
    expect(accepted).toMatchObject(open);
    expect(rejected).toMatchObject(open);
    expect(decidedRowChrome([{ ...shared, currentDecision: null }])).toEqual([]);

    const html = [
      renderToStaticMarkup(createElement(DecisionChangeList, { rows: [accepted!, rejected!] })),
      renderToStaticMarkup(createElement(DecisionEvidence, { row: accepted!, projectId: "project_1" })),
      renderToStaticMarkup(createElement(DecisionEvidence, { row: rejected!, projectId: "project_1" })),
    ].join("");
    expect(html).toContain("Special provisions · Rev B · p. 1");
    expect(html).not.toContain(">p. 1<");
    expect(html).not.toContain("Rev A → Rev B");
    expect(html).toContain("excavation: 1250 CY");
    expect(html.match(/Special provisions/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/>Approved</);
    expect(html).not.toContain("AI-suggested");
  });

  it("cites the pinned revision on the evidence, not the comparison label", () => {
    const chrome = openRowChrome({
      subject: { type: "revision_change", changeType: "MODIFIED" },
      documentTitle: "Special provisions",
      revisionLabel: "Rev A → Rev B",
      before: { category: "quantity", evidence: [{ pageNumber: 1, excerpt: "before", revisionId: "rev_a", revisionLabel: "Rev A", documentTitle: "Special provisions" }] },
      after: { category: "quantity", evidence: [{ pageNumber: 4, excerpt: "after", revisionId: "rev_b", revisionLabel: "Rev B", documentTitle: "Special provisions" }] },
      evidence: [],
    });
    expect(chrome.pageLabel).toBe("Special provisions · Rev B · p. 4");
    expect(chrome.sourceCitation).toBe("Special provisions · Rev B · p. 4");
    expect(chrome.pageLabel).not.toMatch(/^p\. /);
    expect(chrome.sourceCitation).not.toContain("→");
    expect(chrome.pageLabel).not.toContain("Rev Rev");
  });
});
