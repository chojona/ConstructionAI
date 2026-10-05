import { describe, expect, it } from "vitest";
import type { RevisionStatus } from "@/lib/domain/types";
import {
  documentRegisterStatus,
  documentTypeOptions,
  emptyRegisterQuery,
  filterRegisterRows,
  formatIssuedRevision,
  openChangesFromDocument,
  parseRegisterQuery,
  registerQueryString,
  registerRows,
  REGISTER_STATUSES,
  relativeRevisionTime,
  toRegisterDocument,
  type RegisterDocumentDto,
} from "./documentRegister";

const now = new Date("2026-10-05T16:00:00.000Z");

describe("documentRegisterStatus", () => {
  it("derives Current, Processing, and Failed from the latest revision only", () => {
    expect(documentRegisterStatus(true, "PROCESSED")).toBe("Current");
    expect(documentRegisterStatus(true, "PROCESSING")).toBe("Processing");
    expect(documentRegisterStatus(true, "UPLOADED")).toBe("Processing");
    expect(documentRegisterStatus(true, "FAILED")).toBe("Failed");
    expect(documentRegisterStatus(true, null)).toBeNull();
  });

  it("marks every non-latest revision row Superseded", () => {
    for (const status of ["PROCESSED", "PROCESSING", "UPLOADED", "FAILED"] as const satisfies readonly RevisionStatus[]) {
      expect(documentRegisterStatus(false, status)).toBe("Superseded");
    }
  });

  it("uses only Current, Processing, Failed, and Superseded", () => {
    expect(REGISTER_STATUSES).toEqual(["Current", "Processing", "Failed", "Superseded"]);
    expect(REGISTER_STATUSES).not.toContain("Latest");
    expect(REGISTER_STATUSES).not.toContain("Unclassified");
  });
});

describe("document register filters", () => {
  const documents = [
    doc("plan", "Drainage plan", "Plan", [
      rev("plan-a", "A", 1, "PROCESSED", "2026-09-01T00:00:00.000Z", 4),
      rev("plan-b", "B", 2, "FAILED", "2026-10-04T16:00:00.000Z", 6),
    ]),
    doc("spec", "Earthworks specification", "Specification", [
      rev("spec-a", "Rev 04", 1, "PROCESSED", "2026-10-05T15:00:00.000Z", 2),
    ]),
    doc("blank", "Untitled sheet", null, [
      rev("blank-a", "1", 1, "PROCESSING", "2026-10-05T12:00:00.000Z", 1),
    ]),
    doc("empty", "Cover only", "  ", []),
  ];

  it("lists only real document types", () => {
    expect(documentTypeOptions(documents)).toEqual(["Plan", "Specification"]);
    expect(documentTypeOptions(documents)).not.toContain("Unclassified");
    expect(documentTypeOptions([{ documentType: "  Plan set  " }, { documentType: "" }, { documentType: null }])).toEqual(["Plan set"]);
  });

  it("shows one latest row unless the revision filter is all", () => {
    const latest = registerRows(documents, "latest");
    expect(latest.map((row) => [row.title, row.revisionLabel, row.status])).toEqual([
      ["Drainage plan", "B", "Failed"],
      ["Earthworks specification", "Rev 04", "Current"],
      ["Untitled sheet", "1", "Processing"],
      ["Cover only", null, null],
    ]);

    const history = registerRows(documents, "all");
    expect(history.map((row) => [row.revisionLabel, row.status])).toEqual([
      ["B", "Failed"],
      ["A", "Superseded"],
      ["Rev 04", "Current"],
      ["1", "Processing"],
      [null, null],
    ]);
  });

  it("filters by type, status, and title without an unclassified bucket", () => {
    const rows = registerRows(documents, "all");
    expect(filterRegisterRows(rows, { type: "Plan", status: null, query: "" }).map((row) => row.revisionLabel)).toEqual(["B", "A"]);
    expect(filterRegisterRows(rows, { type: "Unclassified", status: null, query: "" })).toEqual([]);
    expect(filterRegisterRows(rows, { type: null, status: "Superseded", query: "" }).map((row) => row.revisionLabel)).toEqual(["A"]);
    expect(filterRegisterRows(rows, { type: null, status: "Current", query: "earth" }).map((row) => row.title)).toEqual(["Earthworks specification"]);
    expect(filterRegisterRows(registerRows(documents, "latest"), { type: null, status: "Superseded", query: "" })).toEqual([]);
  });

  it("parses linkable filters and rejects status labels outside the register", () => {
    expect(parseRegisterQuery({ type: " Plan ", status: "Current", revision: "all", q: " drain ", doc: " plan ", rev: " b " })).toEqual({
      type: "Plan",
      status: "Current",
      revision: "all",
      query: " drain ",
      documentId: "plan",
      revisionId: "b",
    });
    expect(parseRegisterQuery({ status: "Latest", revision: "newest", type: "Unclassified" })).toMatchObject({
      type: "Unclassified",
      status: null,
      revision: "latest",
    });
    expect(parseRegisterQuery({})).toEqual(emptyRegisterQuery());
  });

  it("keeps the project view when writing filter params", () => {
    const current = new URLSearchParams("view=documents&revision=all&doc=old");
    const next = registerQueryString(current, {
      ...emptyRegisterQuery(),
      type: "Plan",
      status: "Failed",
      query: "drain",
      documentId: "plan",
      revisionId: "plan-b",
    });
    expect(new URLSearchParams(next).get("view")).toBe("documents");
    expect(parseRegisterQuery(Object.fromEntries(new URLSearchParams(next)))).toMatchObject({
      type: "Plan",
      status: "Failed",
      revision: "latest",
      query: "drain",
      documentId: "plan",
      revisionId: "plan-b",
    });
  });
});

describe("register counts and time", () => {
  it("counts open changes from this document's revisions", () => {
    const count = openChangesFromDocument(["rev-b", "rev-a"], [
      { sources: [{ revisionId: "rev-b" }], subject: { type: "proposed_fact" } },
      { sources: [{ revisionId: "other" }], subject: { type: "revision_change", revisedRevisionId: "rev-a" } },
      { sources: [{ revisionId: "other" }], subject: { type: "revision_change", revisedRevisionId: "elsewhere" } },
      { sources: [], subject: { type: "proposed_fact" } },
    ]);
    expect(count).toBe(2);
  });

  it("formats relative update time and the issued line", () => {
    expect(relativeRevisionTime(new Date("2026-10-05T15:59:30.000Z"), now)).toBe("just now");
    expect(relativeRevisionTime(new Date("2026-10-05T15:00:00.000Z"), now)).toBe("1 hour ago");
    expect(relativeRevisionTime(new Date("2026-10-03T16:00:00.000Z"), now)).toBe("2 days ago");
    expect(relativeRevisionTime(new Date("2026-10-05T18:00:00.000Z"), now)).toBe("just now");
    expect(formatIssuedRevision(new Date("2026-10-02T23:30:00.000Z"))).toBe("Latest revision issued Oct 2, 2026");
  });

  it("attaches real counts and the latest issued line", () => {
    const record = toRegisterDocument({
      id: "plan",
      title: "Drainage plan",
      documentType: "Plan",
      revisions: [
        { id: "a", revisionLabel: "A", revisionOrder: 1, status: "PROCESSED", createdAt: new Date("2026-09-01T00:00:00.000Z"), pageCount: 4 },
        { id: "b", revisionLabel: "B", revisionOrder: 2, status: "PROCESSED", createdAt: new Date("2026-10-02T00:00:00.000Z"), pageCount: 9 },
      ],
    }, [
      { sources: [{ revisionId: "b" }], subject: { type: "proposed_fact" } },
    ], now);
    expect(record.openChangeCount).toBe(1);
    expect(record.issuedLabel).toBe("Latest revision issued Oct 2, 2026");
    expect(record.revisions.map((revision) => revision.pageCount)).toEqual([4, 9]);
  });
});

function doc(
  id: string,
  title: string,
  documentType: string | null,
  revisions: RegisterDocumentDto["revisions"],
): RegisterDocumentDto {
  return { id, title, documentType, openChangeCount: 0, issuedLabel: null, revisions };
}

function rev(
  id: string,
  revisionLabel: string,
  revisionOrder: number,
  revisionStatus: RevisionStatus,
  createdAt: string,
  pageCount: number,
): RegisterDocumentDto["revisions"][number] {
  return {
    id,
    revisionLabel,
    revisionOrder,
    revisionStatus,
    pageCount,
    updatedLabel: relativeRevisionTime(new Date(createdAt), now),
  };
}
