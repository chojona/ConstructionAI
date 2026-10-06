import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevisionInspection } from "@/components/documents/revision-inspection";
import type { EvidenceLocation } from "./evidenceLocation";
import { citePinStatus, displayRevision, formatCiteLabel, UNPINNED_CITE_LABEL } from "./citeLabel";

const before: EvidenceLocation = {
  documentPageId: "page_a",
  pageNumber: 3,
  excerpt: "Structural excavation 4200 CY.",
  startOffset: 0,
  endOffset: 31,
  revisionId: "rev_a",
  revisionLabel: "Rev A",
  documentTitle: "Special provisions",
};

const after: EvidenceLocation = {
  documentPageId: "page_b",
  pageNumber: 4,
  excerpt: "Structural excavation 5100 CY.",
  startOffset: 0,
  endOffset: 31,
  revisionId: "rev_b",
  revisionLabel: "A",
  documentTitle: "Special provisions",
};

describe("displayRevision", () => {
  it("prefixes a short code once and leaves longer labels and issue names", () => {
    expect(displayRevision("A")).toBe("Rev A");
    expect(displayRevision("2")).toBe("Rev 2");
    expect(displayRevision("B1")).toBe("Rev B1");
    expect(displayRevision("Rev A")).toBe("Rev A");
    expect(displayRevision("Revision C")).toBe("Revision C");
    expect(displayRevision("IFC")).toBe("IFC");
    expect(displayRevision("IFB")).toBe("IFB");
    expect(displayRevision("Bid")).toBe("Bid");
    expect(displayRevision("Addendum 2")).toBe("Addendum 2");
    expect(`not in ${displayRevision("A")}`).toBe("not in Rev A");
    expect(`not in ${displayRevision("Rev A")}`).toBe("not in Rev A");
    expect(`not in ${displayRevision("Revision C")}`).not.toContain("Rev Rev");
  });
});

describe("formatCiteLabel", () => {
  it("builds Doc · Rev · p. N and adds Rev only once", () => {
    expect(formatCiteLabel({
      documentTitle: "Special provisions",
      revisionLabel: "A",
      revisionId: "rev_a",
      page: 2,
    })).toBe("Special provisions · Rev A · p. 2");
    expect(formatCiteLabel({
      documentTitle: "Special provisions",
      revisionLabel: "Rev A",
      revisionId: "rev_a",
      page: "2",
    })).toBe("Special provisions · Rev A · p. 2");
    expect(formatCiteLabel({
      documentTitle: "Drainage Plan",
      revisionLabel: "Revision C",
      revisionId: "rev_c",
      page: 2,
    })).toBe("Drainage Plan · Revision C · p. 2");
    expect(formatCiteLabel({
      documentTitle: "Earthworks specification",
      revisionLabel: "Rev. B (IFC) — add. 2",
      revisionId: "rev_b",
      page: 4,
    })).toBe("Earthworks specification · Rev. B (IFC) — add. 2 · p. 4");
    expect(formatCiteLabel({
      documentTitle: "Plans",
      revisionLabel: "IFC",
      revisionId: "rev_ifc",
      page: 1,
    })).toBe("Plans · IFC · p. 1");
    expect(formatCiteLabel({
      documentTitle: "Plans",
      revisionLabel: "Addendum 2",
      revisionId: "rev_add",
      page: 2,
    })).toBe("Plans · Addendum 2 · p. 2");
    expect(citePinStatus({
      documentTitle: "Unpinned",
      revisionLabel: "A",
      revisionId: "rev_a",
      page: 2,
    })).toBe("Pinned");
    expect(formatCiteLabel({
      documentTitle: "Special provisions",
      revisionLabel: "Rev A",
      revisionId: "rev_a",
      page: 2,
    })).not.toContain("Rev Rev");
  });

  it("uses Unpinned when the lead is not pinned to a revision", () => {
    expect(formatCiteLabel({
      documentTitle: "Special provisions",
      revisionLabel: "Rev A → Rev B",
      revisionId: null,
      page: 2,
    })).toBe(UNPINNED_CITE_LABEL);
    expect(formatCiteLabel({
      documentTitle: "Special provisions",
      revisionLabel: "Rev A",
      revisionId: "rev_a",
      page: 0,
    })).toBe(UNPINNED_CITE_LABEL);
    expect(formatCiteLabel({
      documentTitle: "",
      revisionLabel: "A",
      revisionId: "rev_a",
      page: 2,
    })).toBe(UNPINNED_CITE_LABEL);
    expect(formatCiteLabel({ page: 2 })).toBe(UNPINNED_CITE_LABEL);
  });

  it("names another revision on a jump and keeps the same revision as a page", () => {
    expect(formatCiteLabel({
      surface: "jump",
      revisionLabel: "Rev A",
      revisionId: "rev_a",
      viewedRevisionId: "rev_b",
      page: 3,
    })).toBe("Rev A · p. 3");
    expect(formatCiteLabel({
      surface: "jump",
      revisionLabel: "A",
      revisionId: "rev_b",
      viewedRevisionId: "rev_b",
      page: 4,
    })).toBe("p. 4");
    expect(formatCiteLabel({
      surface: "jump",
      revisionLabel: "Revision C",
      revisionId: "rev_c",
      viewedRevisionId: "rev_b",
      page: 3,
    })).toBe("Revision C · p. 3");
    expect(formatCiteLabel({
      surface: "jump",
      revisionLabel: "Rev A",
      revisionId: null,
      page: 3,
    })).toBe(UNPINNED_CITE_LABEL);
    expect(formatCiteLabel({
      surface: "jump",
      revisionLabel: "A",
      page: 3,
    })).toBe(UNPINNED_CITE_LABEL);
    expect(citePinStatus({
      surface: "jump",
      revisionLabel: "Rev A",
      page: 3,
    })).toBe("Unpinned");
  });
});

describe("revision page jumps", () => {
  it("names the other revision on a jump away from the page being viewed", () => {
    const html = renderToStaticMarkup(createElement(RevisionInspection, {
      revision: {
        id: "rev_b",
        documentId: "document_1",
        revisionLabel: "Rev B",
        revisionOrder: 2,
        originalFilename: "special-b.pdf",
        byteSize: 1200,
        status: "PROCESSED",
        failureCode: null,
        failureMessage: null,
        pageCount: 1,
      },
      siblings: [],
      runs: [{ attemptNumber: 1, status: "SUCCEEDED", failureMessage: null }],
      findings: [{
        label: "Quantity changed",
        material: true,
        evidence: [],
        sources: [{ revisionId: "rev_b" }],
        subject: { type: "revision_change", changeType: "MODIFIED", revisedRevisionId: "rev_b" },
        before: { evidence: [before] },
        after: { evidence: [after] },
      }],
      uploadedLabel: "Oct 2, 2026",
      returnTo: null,
    }));
    expect(html).toContain("Rev A · p. 3");
    expect(html).toContain('href="/revisions/rev_a?');
    expect(html).toContain(">p. 4<");
    expect(html).not.toContain(">Page 3<");
    expect(html).not.toContain("Rev Rev");
  });
});
