import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MembershipRecord } from "./roles";

const { findMembership, listActiveMemberships, listHeavyJobSourceObjects, previewRevisionPage, requireObjectStore } = vi.hoisted(() => ({
  findMembership: vi.fn(),
  listActiveMemberships: vi.fn(),
  listHeavyJobSourceObjects: vi.fn(),
  previewRevisionPage: vi.fn(),
  requireObjectStore: vi.fn(() => ({ kind: "store" })),
}));

vi.mock("@/lib/auth/prismaMembership", () => ({
  membershipStore: { findMembership, listActiveMemberships },
}));

vi.mock("@/lib/heavyjob/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/heavyjob/service")>("@/lib/heavyjob/service");
  return { ...actual, listHeavyJobSourceObjects };
});

vi.mock("@/lib/review/pagePreview", () => ({ previewRevisionPage }));
vi.mock("@/lib/storage/objectStore", () => ({ requireObjectStore }));

import { GET as listHeavyJob } from "@/app/api/projects/[projectId]/heavyjob-objects/route";
import { GET as previewPage } from "@/app/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]/route";

const rows: MembershipRecord[] = [];

function member(role: MembershipRecord["role"], userId: string, organizationId = "org_a", status: MembershipRecord["status"] = "ACTIVE"): MembershipRecord {
  return { id: `membership_${userId}_${organizationId}`, organizationId, userId, role, status };
}

function heavyJob(headers: Record<string, string>, projectId = "project_1", query = "") {
  return listHeavyJob(
    new NextRequest(`http://localhost/api/projects/${projectId}/heavyjob-objects${query}`, { headers }),
    { params: Promise.resolve({ projectId }) },
  );
}

function pageImage(headers: Record<string, string>) {
  return previewPage(
    new NextRequest("http://localhost/api/projects/project_1/revisions/rev_1/pages/1", { headers }),
    { params: Promise.resolve({ projectId: "project_1", revisionId: "rev_1", pageNumber: "1" }) },
  );
}

describe("HeavyJob and document page reads", () => {
  beforeEach(() => {
    rows.length = 0;
    findMembership.mockImplementation(async (userId: string, organizationId: string) =>
      rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null);
    listActiveMemberships.mockImplementation(async (userId: string) =>
      rows.filter((row) => row.userId === userId && row.status === "ACTIVE"));
    listHeavyJobSourceObjects.mockReset();
    listHeavyJobSourceObjects.mockResolvedValue([]);
    previewRevisionPage.mockReset();
    previewRevisionPage.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    requireObjectStore.mockClear();
  });

  it("lets a viewer of the organization read HeavyJob snapshots", async () => {
    rows.push(member("VIEWER", "user_a"));
    const response = await heavyJob({ "x-user-id": "user_a", "x-organization-id": "org_a" }, "project_1", "?objectType=quantity");
    expect(response.status).toBe(200);
    expect(listHeavyJobSourceObjects).toHaveBeenCalledWith("org_a", "project_1", "quantity");
  });

  it("does not let a member of org A read org B HeavyJob snapshots", async () => {
    rows.push(member("ORG_ADMIN", "user_a", "org_a"));
    const response = await heavyJob({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", message: "You do not have access to this organization." },
    });
    expect(listHeavyJobSourceObjects).not.toHaveBeenCalled();
  });

  it("denies invited and disabled members before listing snapshots", async () => {
    rows.push(member("REVIEWER", "user_invited", "org_a", "INVITED"), member("REVIEWER", "user_off", "org_a", "DISABLED"));
    const invited = await heavyJob({ "x-user-id": "user_invited", "x-organization-id": "org_a" });
    expect(invited.status).toBe(403);
    const disabled = await heavyJob({ "x-user-id": "user_off", "x-organization-id": "org_a" });
    expect(disabled.status).toBe(403);
    await expect(disabled.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN", message: "This account is disabled for the organization." },
    });
    expect(listHeavyJobSourceObjects).not.toHaveBeenCalled();
  });

  it("does not let a member of org A read another organization's document page", async () => {
    rows.push(member("REVIEWER", "user_a", "org_a"));
    const response = await pageImage({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    expect(response.status).toBe(403);
    expect(previewRevisionPage).not.toHaveBeenCalled();
    expect(requireObjectStore).not.toHaveBeenCalled();
  });

  it("previews a document page for an active member of that organization", async () => {
    rows.push(member("VIEWER", "user_a"));
    const response = await pageImage({ "x-user-id": "user_a", "x-organization-id": "org_a" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(previewRevisionPage).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org_a",
      projectId: "project_1",
      revisionId: "rev_1",
      pageNumber: 1,
    }));
  });

  it("denies an invited member the document page image", async () => {
    rows.push(member("ORG_ADMIN", "user_invited", "org_a", "INVITED"));
    const response = await pageImage({ "x-user-id": "user_invited", "x-organization-id": "org_a" });
    expect(response.status).toBe(403);
    expect(previewRevisionPage).not.toHaveBeenCalled();
  });
});
