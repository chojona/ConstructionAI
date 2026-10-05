import { describe, expect, it } from "vitest";
import { reviewSummaryCounts } from "./reviewSummary";

describe("review summary", () => {
  it("matches the ledger after accept and dismiss", () => {
    const now = new Date("2026-10-05T16:00:00.000Z");
    const open = new Set(["fact-a", "fact-b", "fact-c"]);
    const ledger: { decision: string; createdAt: Date; subjectKey: string }[] = [];

    const snapshot = () => reviewSummaryCounts({ needsReview: open.size, decisions: ledger }, now);

    expect(snapshot()).toEqual({ needsReview: 3, acceptedToday: 0, rejectedToday: 0 });

    ledger.push({ decision: "ACCEPTED", createdAt: now, subjectKey: "fact-a" });
    open.delete("fact-a");
    expect(snapshot()).toEqual({ needsReview: 2, acceptedToday: 1, rejectedToday: 0 });

    ledger.push({ decision: "DISMISSED", createdAt: now, subjectKey: "fact-b" });
    open.delete("fact-b");
    expect(snapshot()).toEqual({ needsReview: 1, acceptedToday: 1, rejectedToday: 1 });

    ledger.push({ decision: "ACCEPTED", createdAt: now, subjectKey: "fact-c" });
    ledger.push({ decision: "DISMISSED", createdAt: now, subjectKey: "fact-c" });
    open.delete("fact-c");
    expect(snapshot()).toEqual({ needsReview: 0, acceptedToday: 2, rejectedToday: 2 });
  });

  it("ignores other days, flags, and unreadable timestamps", () => {
    const now = new Date("2026-10-05T16:00:00.000Z");
    const counts = reviewSummaryCounts({
      needsReview: 1,
      decisions: [
        { decision: "ACCEPTED", createdAt: "2026-10-04T23:59:59.000Z" },
        { decision: "DISMISSED", createdAt: "2026-10-06T00:00:00.000Z" },
        { decision: "FLAGGED", createdAt: now },
        { decision: "ACCEPTED", createdAt: "not-a-date" },
        { decision: "ACCEPTED", createdAt: "2026-10-05T00:00:00.000Z" },
      ],
    }, now);
    expect(counts).toEqual({ needsReview: 1, acceptedToday: 1, rejectedToday: 0 });
  });
});
