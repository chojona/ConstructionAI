import { describe, expect, it } from "vitest";
import type { RevisionStatus } from "@/lib/domain/types";
import {
  currentRevision,
  documentRegisterStatus,
  revisionIsLatest,
  revisionRelation,
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
  it("labels the newest processed revision Current and older revisions Superseded", () => {
    const revisions = [
      { id: "a", revisionOrder: 1, status: "PROCESSED" as const },
      { id: "b", revisionOrder: 2, status: "PROCESSED" as const },
    ];
    expect(currentRevision(revisions)?.id).toBe("b");
    expect(documentRegisterStatus("PROCESSED", revisionRelation(revisions[1]!, revisions))).toBe("Current");
    expect(documentRegisterStatus("PROCESSED", revisionRelation(revisions[0]!, revisions))).toBe("Superseded");
    expect(documentRegisterStatus(null, "current")).toBeNull();
  });

  it("keeps a later failed or processing upload on its own status", () => {
    const failed = [
      { id: "b", revisionOrder: 2, status: "PROCESSED" as const },
      { id: "c", revisionOrder: 3, status: "FAILED" as const },
    ];
    const processing = [
      { id: "b", revisionOrder: 2, status: "PROCESSED" as const },
      { id: "c", revisionOrder: 3, status: "PROCESSING" as const },
    ];
    const uploaded = [
      { id: "b", revisionOrder: 2, status: "PROCESSED" as const },
      { id: "c", revisionOrder: 3, status: "UPLOADED" as const },
    ];
    expect(documentRegisterStatus("FAILED", revisionRelation(failed[1]!, failed))).toBe("Failed");
    expect(documentRegisterStatus("PROCESSED", revisionRelation(failed[0]!, failed))).toBe("Current");
    expect(documentRegisterStatus("PROCESSING", revisionRelation(processing[1]!, processing))).toBe("Processing");
    expect(documentRegisterStatus("UPLOADED", revisionRelation(uploaded[1]!, uploaded))).toBe("Processing");
  });

  it("gives every revision its own status when nothing is processed", () => {
    const revisions = [
      { id: "a", revisionOrder: 1, status: "FAILED" as const },
      { id: "b", revisionOrder: 2, status: "PROCESSING" as const },
      { id: "c", revisionOrder: 3, status: "UPLOADED" as const },
    ];
    expect(currentRevision(revisions)).toBeNull();
    expect(documentRegisterStatus("FAILED", revisionRelation(revisions[0]!, revisions))).toBe("Failed");
    expect(documentRegisterStatus("PROCESSING", revisionRelation(revisions[1]!, revisions))).toBe("Processing");
    expect(documentRegisterStatus("UPLOADED", revisionRelation(revisions[2]!, revisions))).toBe("Processing");
    for (const status of ["PROCESSED", "PROCESSING", "UPLOADED", "FAILED"] as const satisfies readonly RevisionStatus[]) {
      expect(documentRegisterStatus(status, "older")).toBe("Superseded");
    }
  });

  it("treats the highest upload order as latest, including a revision missing from the list", () => {
    const older = { id: "a", revisionOrder: 1 };
    const newer = { id: "b", revisionOrder: 2 };
    expect(revisionIsLatest(newer, [older, newer])).toBe(true);
    expect(revisionIsLatest(older, [older, newer])).toBe(false);
    expect(revisionIsLatest(newer, [])).toBe(true);
    expect(revisionIsLatest({ id: "b", revisionOrder: 2 }, [{ id: "a", revisionOrder: 2 }])).toBe(true);
    expect(revisionIsLatest({ id: "a", revisionOrder: 2 }, [{ id: "b", revisionOrder: 2 }])).toBe(false);
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
      rev("plan-b", "B", 2, "PROCESSED", "2026-10-02T00:00:00.000Z", 6),
      rev("plan-c", "C", 3, "FAILED", "2026-10-04T16:00:00.000Z", 8),
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

  it("shows the newest processed revision unless the revision filter is all", () => {
    const latest = registerRows(documents, "latest");
    expect(latest.map((row) => [row.title, row.revisionLabel, row.status])).toEqual([
      ["Drainage plan", "B", "Current"],
      ["Earthworks specification", "Rev 04", "Current"],
      ["Cover only", null, null],
    ]);

    const history = registerRows(documents, "all");
    expect(history.map((row) => [row.revisionLabel, row.status])).toEqual([
      ["C", "Failed"],
      ["B", "Current"],
      ["A", "Superseded"],
      ["Rev 04", "Current"],
      ["1", "Processing"],
      [null, null],
    ]);
  });

  it("filters by type, status, and title without an unclassified bucket", () => {
    const rows = registerRows(documents, "all");
    expect(filterRegisterRows(rows, { type: "Plan", status: null, query: "" }).map((row) => row.revisionLabel)).toEqual(["C", "B", "A"]);
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

  it("formats relative update time and the uploaded line", () => {
    expect(relativeRevisionTime(new Date("2026-10-05T15:59:30.000Z"), now)).toBe("just now");
    expect(relativeRevisionTime(new Date("2026-10-05T15:00:00.000Z"), now)).toBe("1 hour ago");
    expect(relativeRevisionTime(new Date("2026-10-03T16:00:00.000Z"), now)).toBe("2 days ago");
    expect(relativeRevisionTime(new Date("2026-10-05T18:00:00.000Z"), now)).toBe("just now");
    expect(formatIssuedRevision(new Date("2026-10-02T23:30:00.000Z"))).toBe("Current revision uploaded Oct 2, 2026");
    expect(formatIssuedRevision(new Date("2026-10-02T23:30:00.000Z"))).not.toMatch(/issued|Latest/);
  });

  it("dates the uploaded line from the newest processed revision", () => {
    const record = toRegisterDocument({
      id: "plan",
      title: "Drainage plan",
      documentType: "Plan",
      revisions: [
        { id: "a", revisionLabel: "A", revisionOrder: 1, status: "PROCESSED", createdAt: new Date("2026-09-01T00:00:00.000Z"), pageCount: 4 },
        { id: "b", revisionLabel: "B", revisionOrder: 2, status: "PROCESSED", createdAt: new Date("2026-10-02T00:00:00.000Z"), pageCount: 9 },
        { id: "c", revisionLabel: "C", revisionOrder: 3, status: "FAILED", createdAt: new Date("2026-10-04T00:00:00.000Z"), pageCount: 8 },
      ],
    }, [
      { sources: [{ revisionId: "b" }], subject: { type: "proposed_fact" } },
    ], now);
    expect(record.openChangeCount).toBe(1);
    expect(record.issuedLabel).toBe("Current revision uploaded Oct 2, 2026");
    expect(record.revisions.map((revision) => revision.pageCount)).toEqual([4, 9, 8]);
  });

  it("omits the uploaded line when nothing is processed", () => {
    const record = toRegisterDocument({
      id: "plan",
      title: "Drainage plan",
      documentType: "Plan",
      revisions: [
        { id: "c", revisionLabel: "C", revisionOrder: 1, status: "FAILED", createdAt: new Date("2026-10-04T00:00:00.000Z"), pageCount: 1 },
      ],
    }, [], now);
    expect(record.issuedLabel).toBeNull();
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
