import { describe, expect, it } from "vitest";
import { defaultDeskKey, deskFactCite, mergeDeskFacts } from "./factList";
import { proposedFactSubjectKey } from "./subjects";

const trench = {
  proposedFactId: "fact-trench",
  summary: "excavation: 1250 CY",
  documentTitle: "Earthworks specification",
  revisionLabel: "Rev 04",
  reviewerId: "demo-seed",
  evidence: [{ pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
};

describe("desk fact list", () => {
  it("merges an approved pack row into the current value that already cites it", () => {
    const rows = mergeDeskFacts([trench], [{
      subjectKey: "proposed-fact:fact-trench",
      decision: "ACCEPTED",
      summary: "Quantity to review",
      evidence: [{ revisionId: "rev", revisionLabel: "Rev 04", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
    }]);
    expect(rows).toEqual([{
      key: "value:fact-trench",
      title: "excavation: 1250 CY",
      meta: "Earthworks specification · Rev 04 · accepted by demo-seed",
      pageNumber: 1,
      excerpt: "Excavation quantity is 1,250 CY.",
    }]);
    expect(deskFactCite(rows[0]!)).toEqual({ page: 1, excerpt: "Excavation quantity is 1,250 CY." });
    expect(proposedFactSubjectKey("fact-trench")).toBe("proposed-fact:fact-trench");
  });

  it("keeps an approved change that is not already a current value", () => {
    const rows = mergeDeskFacts([trench], [{
      subjectKey: "revision-change:base:revised:MODIFIED:slot:fact-next",
      decision: "ACCEPTED",
      summary: "Quantity changed",
      evidence: [{ revisionId: "rev-b", revisionLabel: "Rev 05", pageNumber: 2, excerpt: "Excavation quantity is 1,500 CY." }],
    }]);
    expect(rows.map((row) => row.key)).toEqual([
      "value:fact-trench",
      "pack:revision-change:base:revised:MODIFIED:slot:fact-next",
    ]);
    expect(rows[1]).toMatchObject({ pageNumber: 2, excerpt: "Excavation quantity is 1,500 CY.", meta: "Approved" });
  });

  it("drops an approved change that repeats a current value excerpt", () => {
    const rows = mergeDeskFacts([trench], [{
      subjectKey: "revision-change:base:revised:MODIFIED:slot:fact-trench",
      decision: "ACCEPTED",
      summary: "Quantity changed",
      evidence: [{ revisionId: "rev", revisionLabel: "Rev 04", pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
    }]);
    expect(rows).toHaveLength(1);
  });

  it("selects the first cited fact so the rail is not empty", () => {
    const facts = [
      { key: "value:bare", pageNumber: null },
      { key: "value:cited", pageNumber: 4 },
    ];
    const findings = [{ key: "finding-open", pageNumber: 9 }];
    expect(defaultDeskKey(facts, findings)).toBe("value:cited");
    expect(defaultDeskKey([{ key: "value:bare", pageNumber: null }], findings)).toBe("finding-open");
    expect(defaultDeskKey([], [{ key: "finding-open", pageNumber: null }])).toBe("");
    expect(deskFactCite({ pageNumber: null, excerpt: "unused" })).toBeNull();
  });
});
