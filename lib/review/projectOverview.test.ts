import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { decisionReturnPath } from "./evidenceLocation";
import { EXPORT_BLOCKED_MESSAGE, EXPORT_OPEN_MESSAGE } from "./exportPacketView";
import {
  NOTHING_AUTO_APPROVED,
  REVIEW_QUEUE_LABEL,
  projectOverviewModel,
  type ProjectOverviewInput,
} from "./projectOverview";
import { getProjectReview } from "./service";

const now = new Date("2026-10-05T16:00:00.000Z");

function input(overrides: Partial<ProjectOverviewInput> = {}): ProjectOverviewInput {
  return {
    projectId: "prj_1",
    attention: [],
    decisions: [],
    documentCount: 0,
    revisionCreatedAt: [],
    approvedCount: 0,
    now,
    projectUpdatedAt: new Date("2026-10-05T15:55:00.000Z"),
    ...overrides,
  };
}

describe("projectOverviewModel", () => {
  it("hides the banner and stays quiet when nothing is open", () => {
    const model = projectOverviewModel(input());
    expect(model.banner).toBeNull();
    expect(model.stats.map((stat) => [stat.key, stat.label, stat.value, stat.helper, stat.dot])).toEqual([
      ["attention", "Needs attention", 0, "0 high severity", "neutral"],
      ["export", "Export blocked", 0, EXPORT_BLOCKED_MESSAGE, "blocked"],
      ["documents", "Documents", 0, "0 revisions added this month", "neutral"],
      ["decisions", "Decisions recorded", 0, "0 accepted · 0 dismissed · 0 flagged", "neutral"],
    ]);
    expect(model.evidenceNote).toBe(NOTHING_AUTO_APPROVED);
    expect(model.updatedLabel).toBe("Updated 5 minutes ago");
  });

  it("leads with the highest-severity open change and links the review queue", () => {
    const model = projectOverviewModel(input({
      attention: [
        { severity: "medium", summary: "  quantity\nshifted  ", subjectKey: "medium-1" },
        { severity: "critical", summary: "Crane removed from the plan", subjectKey: "critical-1" },
        { severity: "high", summary: "Schedule moved", subjectKey: "high-1" },
      ],
      decisions: [
        { decision: "FLAGGED" },
        { decision: "ACCEPTED" },
        { decision: "ACCEPTED" },
        { decision: "DISMISSED" },
      ],
      documentCount: 4,
      revisionCreatedAt: [
        new Date("2026-09-30T23:59:59.000Z"),
        new Date("2026-10-01T00:00:00.000Z"),
        new Date("2026-10-05T12:00:00.000Z"),
        new Date("2026-11-01T00:00:00.000Z"),
      ],
      approvedCount: 2,
    }));

    expect(model.banner).toEqual({
      title: "3 changes need a decision",
      summary: "Crane removed from the plan",
      actionLabel: REVIEW_QUEUE_LABEL,
      href: decisionReturnPath("prj_1", "critical-1"),
    });
    expect(model.stats[0]).toMatchObject({ value: 3, helper: "1 critical, 1 high severity", noteTone: "attention" });
    expect(model.stats[1]).toMatchObject({
      label: "Export blocked",
      value: 2,
      helper: EXPORT_OPEN_MESSAGE,
      dot: "blocked",
    });
    expect(model.stats[2]).toMatchObject({ value: 4, helper: "2 revisions added this month" });
    expect(model.stats[3]).toMatchObject({
      value: 4,
      helper: "2 accepted · 1 dismissed · 1 flagged",
    });
    expect(JSON.stringify(model).toLowerCase()).not.toMatch(/change order|force account|entitlement|\bdsc\b|\bpco\b/);
  });

  it("marks export ready only after approve when the queue is clear", () => {
    const model = projectOverviewModel(input({
      attention: [],
      approvedCount: 1,
      decisions: [{ decision: "ACCEPTED" }],
      documentCount: 1,
      revisionCreatedAt: [new Date("2026-10-02T00:00:00.000Z")],
      projectUpdatedAt: new Date("2026-10-05T15:59:10.000Z"),
    }));
    expect(model.banner).toBeNull();
    expect(model.stats[1]).toMatchObject({
      label: "Approved, ready to export",
      value: 1,
      helper: NOTHING_AUTO_APPROVED,
      dot: "ready",
      noteTone: "success",
    });
    expect(model.evidenceNote).toBeNull();
    expect(model.stats[2]?.helper).toBe("1 revision added this month");
    expect(model.updatedLabel).toBe("Updated just now");
  });

  it("keeps the first item when severities tie and pluralizes a single change", () => {
    const model = projectOverviewModel(input({
      attention: [
        { severity: "high", summary: "First high", subjectKey: "a" },
        { severity: "high", summary: "Second high", subjectKey: "b" },
      ],
      projectUpdatedAt: new Date("2026-10-04T16:00:00.000Z"),
    }));
    expect(model.banner?.title).toBe("2 changes need a decision");
    expect(model.banner?.summary).toBe("First high");
    expect(model.stats[0]?.helper).toBe("2 high severity");
    expect(model.updatedLabel).toBe("Updated 1 day ago");

    const single = projectOverviewModel(input({
      attention: [{ severity: "critical", summary: "", subjectKey: "only" }],
      projectUpdatedAt: new Date("2026-10-05T14:00:00.000Z"),
    }));
    expect(single.banner?.title).toBe("1 change needs a decision");
    expect(single.banner?.summary).toBe("Open change");
    expect(single.stats[0]?.helper).toBe("1 critical");
    expect(single.updatedLabel).toBe("Updated 2 hours ago");
  });

  it("counts revision timestamps loaded with the review", async () => {
    const repository = new MemoryRepository();
    repository.addOrganization("org_a");
    const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
    const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Drainage Plan" });
    await repository.createRevision({
      documentId: document!.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      sha256: "a".repeat(64),
      storageKey: "revisions/a.pdf",
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: "Cover", textSha256: "c".repeat(64) }],
    });
    const review = await getProjectReview("org_a", project.id, repository);
    expect(review.revisionCreatedAt).toHaveLength(1);
    const during = projectOverviewModel(input({
      revisionCreatedAt: review.revisionCreatedAt,
      documentCount: 1,
      now: review.revisionCreatedAt[0]!,
      projectUpdatedAt: project.updatedAt,
    }));
    expect(during.stats[2]?.helper).toBe("1 revision added this month");
    const nextMonth = projectOverviewModel(input({
      revisionCreatedAt: review.revisionCreatedAt,
      documentCount: 1,
      now: new Date(Date.UTC(review.revisionCreatedAt[0]!.getUTCFullYear(), review.revisionCreatedAt[0]!.getUTCMonth() + 1, 1)),
    }));
    expect(nextMonth.stats[2]?.helper).toBe("0 revisions added this month");
  });
});
