import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MembershipRecord } from "./roles";

const { findMembership, listActiveMemberships, listMembershipsForUser, exportApprovedChangePacket, recordReviewDecision, getProjectReview } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  listActiveMemberships: vi.fn(),
  listMembershipsForUser: vi.fn(),
  exportApprovedChangePacket: vi.fn(),
  recordReviewDecision: vi.fn(),
  getProjectReview: vi.fn(),
}));

vi.mock("@/lib/auth/prismaMembership", () => ({
  membershipStore: { findMembership, listActiveMemberships, listMembershipsForUser },
}));

vi.mock("@/lib/review/service", () => ({
  exportApprovedChangePacket,
  recordReviewDecision,
  getProjectReview,
}));

import { GET as exportPack } from "@/app/api/projects/[projectId]/export/route";
import { GET as readReviews, POST as approve } from "@/app/api/projects/[projectId]/reviews/route";

const rows: MembershipRecord[] = [];

function member(role: MembershipRecord["role"], userId: string, organizationId = "org_a", status: MembershipRecord["status"] = "ACTIVE"): MembershipRecord {
  return { id: `membership_${userId}`, organizationId, userId, role, status };
}

function callExport(headers: Record<string, string>) {
  return exportPack(
    new NextRequest("http://localhost/api/projects/project_1/export", { headers }),
    { params: Promise.resolve({ projectId: "project_1" }) },
  );
}

function callApprove(headers: Record<string, string>) {
  return approve(
    new NextRequest("http://localhost/api/projects/project_1/reviews", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ decision: "ACCEPTED" }),
    }),
    { params: Promise.resolve({ projectId: "project_1" }) },
  );
}

describe("project export and approve routes", () => {
  beforeEach(() => {
    rows.length = 0;
    findMembership.mockImplementation(async (userId: string, organizationId: string) =>
      rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null);
    listActiveMemberships.mockImplementation(async (userId: string) =>
      rows.filter((row) => row.userId === userId && row.status === "ACTIVE"));
    listMembershipsForUser.mockImplementation(async (userId: string) =>
      rows.filter((row) => row.userId === userId));
    exportApprovedChangePacket.mockReset();
    exportApprovedChangePacket.mockResolvedValue({ ok: true });
    recordReviewDecision.mockReset();
    recordReviewDecision.mockResolvedValue({
      id: "decision_1",
      projectId: "project_1",
      subjectKind: "PROPOSED_FACT",
      subjectKey: "fact:1",
      decision: "ACCEPTED",
      reviewerId: "user_reviewer",
      reason: null,
      proposedFactId: "fact_1",
      beforeProposedFactId: null,
      afterProposedFactId: null,
      baseRevisionId: null,
      revisedRevisionId: null,
      changeType: null,
      supersedesDecisionId: null,
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
    });
    getProjectReview.mockReset();
    getProjectReview.mockResolvedValue({ decisions: [], findings: [] });
  });

  it("denies export to a Viewer and allows it to a Reviewer", async () => {
    rows.push(member("VIEWER", "user_view"));
    const denied = await callExport({ "x-user-id": "user_view", "x-organization-id": "org_a" });
    expect(denied.status).toBe(403);
    expect(exportApprovedChangePacket).not.toHaveBeenCalled();

    rows.push(member("REVIEWER", "user_reviewer"));
    const allowed = await callExport({ "x-user-id": "user_reviewer", "x-organization-id": "org_a" });
    expect(allowed.status).toBe(200);
    expect(exportApprovedChangePacket).toHaveBeenCalledWith("org_a", "project_1", { subjectKey: null });
  });

  it("does not let a member of org A export org B", async () => {
    rows.push(member("REVIEWER", "user_a", "org_a"));
    const response = await callExport({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    expect(response.status).toBe(403);
    expect(exportApprovedChangePacket).not.toHaveBeenCalled();
  });

  it("denies a disabled member", async () => {
    rows.push(member("REVIEWER", "user_off", "org_a", "DISABLED"));
    const response = await callExport({ "x-user-id": "user_off", "x-organization-id": "org_a" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", message: "This account is disabled for the organization." },
    });
  });

  it("lets a Viewer read decisions and records Approve under the Reviewer's User id", async () => {
    rows.push(member("VIEWER", "user_view"), member("REVIEWER", "user_reviewer"));
    const read = await readReviews(
      new NextRequest("http://localhost/api/projects/project_1/reviews", {
        headers: { "x-user-id": "user_view", "x-organization-id": "org_a" },
      }),
      { params: Promise.resolve({ projectId: "project_1" }) },
    );
    expect(read.status).toBe(200);

    const denied = await callApprove({
      "x-user-id": "user_view",
      "x-organization-id": "org_a",
      "x-reviewer-id": "Alex Chen",
    });
    expect(denied.status).toBe(403);
    expect(recordReviewDecision).not.toHaveBeenCalled();

    const allowed = await callApprove({
      "x-user-id": "user_reviewer",
      "x-organization-id": "org_a",
      "x-reviewer-id": "Alex Chen",
    });
    expect(allowed.status).toBe(201);
    expect(recordReviewDecision).toHaveBeenCalledWith(
      "org_a",
      "project_1",
      "user_reviewer",
      { decision: "ACCEPTED" },
    );
  });
});
