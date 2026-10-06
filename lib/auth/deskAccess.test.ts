import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipRecord } from "./roles";

const {
  headerState,
  cookieState,
  findMembership,
  listActiveMemberships,
  listMembershipsForUser,
  findValidSession,
  getProject,
  listProjects,
  getProjectReview,
  currentApprovedChangePacket,
  listHeavyJobSourceObjects,
  getDocument,
  getRevision,
  listRevisionAnalysis,
  listDocumentRegister,
  readEmailSend,
} = vi.hoisted(() => ({
  headerState: new Map<string, string>(),
  cookieState: new Map<string, string>(),
  findMembership: vi.fn(),
  listActiveMemberships: vi.fn(),
  listMembershipsForUser: vi.fn(),
  findValidSession: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(),
  getProjectReview: vi.fn(),
  currentApprovedChangePacket: vi.fn(),
  listHeavyJobSourceObjects: vi.fn(),
  getDocument: vi.fn(),
  getRevision: vi.fn(),
  listRevisionAnalysis: vi.fn(),
  listDocumentRegister: vi.fn(),
  readEmailSend: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerState.get(name.toLowerCase()) ?? null,
  }),
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieState.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("@/lib/auth/prismaMembership", () => ({
  membershipStore: { findMembership, listActiveMemberships, listMembershipsForUser, findValidSession },
}));

vi.mock("@/lib/projects/service", () => ({ getProject, listProjects }));
vi.mock("@/lib/review/service", () => ({ getProjectReview, currentApprovedChangePacket }));
vi.mock("@/lib/heavyjob/service", () => ({ listHeavyJobSourceObjects }));
vi.mock("@/lib/documents/service", () => ({ getDocument, getRevision, listRevisionAnalysis, listDocumentRegister }));
vi.mock("@/lib/email/service", () => ({ readEmailSend }));

import ChangesPage from "@/app/changes/page";
import DocumentPage from "@/app/documents/[documentId]/page";
import ProjectPage from "@/app/projects/[projectId]/page";
import ProjectsPage from "@/app/projects/page";
import EmailPage from "@/app/projects/[projectId]/emails/[emailSendId]/page";
import RevisionPage from "@/app/revisions/[revisionId]/page";
import { ProjectContext } from "@/components/workspace/project-context";
import { DEMO_USER_ID } from "./demoUser";
import { hashToken, SESSION_COOKIE } from "./sessionToken";
import { loadAppShell } from "@/lib/workspace/appShellData";

const rows: MembershipRecord[] = [];
const previousOrg = process.env.APP_ORGANIZATION_ID;
const previousInterrupt = process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS;

function setHeaders(values: Record<string, string> = {}) {
  headerState.clear();
  cookieState.clear();
  for (const [key, value] of Object.entries(values)) headerState.set(key.toLowerCase(), value);
}

function member(role: MembershipRecord["role"], userId: string, organizationId = "org_a", status: MembershipRecord["status"] = "ACTIVE"): MembershipRecord {
  return { id: `membership_${userId}_${organizationId}`, organizationId, userId, role, status };
}

function projectProps(view?: string) {
  return {
    params: Promise.resolve({ projectId: "project_1" }),
    searchParams: Promise.resolve(view ? { view } : {}),
  };
}

async function expectDenied(run: () => Promise<unknown>) {
  await expect(run()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
}

beforeEach(() => {
  rows.length = 0;
  setHeaders();
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "1";
  findMembership.mockImplementation(async (userId: string, organizationId: string) =>
    rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null);
  listActiveMemberships.mockImplementation(async (userId: string) =>
    rows.filter((row) => row.userId === userId && row.status === "ACTIVE"));
  listMembershipsForUser.mockImplementation(async (userId: string) =>
    rows.filter((row) => row.userId === userId));
  findValidSession.mockResolvedValue(null);
  getProject.mockReset();
  getProject.mockResolvedValue({
    id: "project_1",
    name: "River",
    projectNumber: "NS-1",
    documents: [],
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  listProjects.mockReset();
  listProjects.mockResolvedValue([{ id: "project_1", name: "River", projectNumber: "NS-1", documentCount: 0 }]);
  getProjectReview.mockReset();
  getProjectReview.mockResolvedValue({
    findings: [],
    decisions: [],
    revisionCreatedAt: [],
    state: { retirements: [] },
  });
  currentApprovedChangePacket.mockReset();
  listHeavyJobSourceObjects.mockReset();
  listHeavyJobSourceObjects.mockResolvedValue([]);
  getDocument.mockReset();
  getDocument.mockResolvedValue({
    id: "doc_1",
    title: "Spec",
    documentType: null,
    revisions: [],
    project: { id: "project_1", name: "River" },
  });
  getRevision.mockReset();
  getRevision.mockResolvedValue({
    id: "rev_1",
    revisionLabel: "A",
    originalFilename: "spec.pdf",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    pages: [],
    document: {
      id: "doc_1",
      title: "Spec",
      documentType: null,
      project: { id: "project_1", name: "River" },
    },
  });
  listRevisionAnalysis.mockReset();
  listRevisionAnalysis.mockResolvedValue([]);
  listDocumentRegister.mockReset();
  listDocumentRegister.mockResolvedValue([]);
  readEmailSend.mockReset();
  readEmailSend.mockResolvedValue({
    id: "email_1",
    status: "DRAFT",
    recipients: ["pm@example.com"],
    subject: "Changes",
    body: "Please review.",
    actorId: "user_a",
    exportPacketId: "pack_1",
    documentIds: [],
    reviewDecisionIds: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    sentAt: null,
    ledgerPath: "/projects/project_1/emails/email_1",
  });
});

afterEach(() => {
  if (previousOrg === undefined) delete process.env.APP_ORGANIZATION_ID;
  else process.env.APP_ORGANIZATION_ID = previousOrg;
  if (previousInterrupt === undefined) delete process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS;
  else process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = previousInterrupt;
});

describe("server-rendered desks", () => {
  it("loads HeavyJob for a member and refuses another organization", async () => {
    rows.push(member("VIEWER", "user_a"));
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_a" });
    await ProjectPage(projectProps("heavyjob"));
    expect(getProject).toHaveBeenCalledWith("org_a", "project_1");
    expect(listHeavyJobSourceObjects).toHaveBeenCalledWith("org_a", "project_1");

    await ProjectPage(projectProps("documents"));
    expect(listDocumentRegister).toHaveBeenCalledWith("org_a", "project_1");

    getProject.mockClear();
    listHeavyJobSourceObjects.mockClear();
    listDocumentRegister.mockClear();
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    await expectDenied(() => ProjectPage(projectProps("documents")));
    expect(getProject).not.toHaveBeenCalled();
    expect(listHeavyJobSourceObjects).not.toHaveBeenCalled();
    expect(listDocumentRegister).not.toHaveBeenCalled();
  });

  it("denies an invited or disabled member the project desk", async () => {
    rows.push(member("ORG_ADMIN", "user_invited", "org_a", "INVITED"));
    setHeaders({ "x-user-id": "user_invited", "x-organization-id": "org_a" });
    await expectDenied(() => ProjectPage(projectProps()));
    rows.push(member("REVIEWER", "user_off", "org_a", "DISABLED"));
    setHeaders({ "x-user-id": "user_off", "x-organization-id": "org_a" });
    await expectDenied(() => ProjectPage(projectProps()));
    expect(getProject).not.toHaveBeenCalled();
  });

  it("reads a document for a member and hides it from another organization", async () => {
    rows.push(member("VIEWER", "user_a"));
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_a" });
    await DocumentPage({
      params: Promise.resolve({ documentId: "doc_1" }),
      searchParams: Promise.resolve({}),
    });
    expect(getDocument).toHaveBeenCalledWith("org_a", "doc_1");

    getDocument.mockClear();
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    await expectDenied(() => DocumentPage({
      params: Promise.resolve({ documentId: "doc_1" }),
      searchParams: Promise.resolve({}),
    }));
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("denies cross-org revision, portfolio, changes, and email ledger reads", async () => {
    rows.push(member("REVIEWER", "user_a"));
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_b" });
    await expectDenied(() => RevisionPage({
      params: Promise.resolve({ revisionId: "rev_1" }),
      searchParams: Promise.resolve({}),
    }));
    await expectDenied(() => ProjectsPage());
    await expectDenied(() => ChangesPage());
    await expectDenied(() => EmailPage({
      params: Promise.resolve({ projectId: "project_1", emailSendId: "email_1" }),
    }));
    await expectDenied(() => ProjectContext({ projectId: "project_1", children: "Projects" }));
    expect(getRevision).not.toHaveBeenCalled();
    expect(listProjects).not.toHaveBeenCalled();
    expect(readEmailSend).not.toHaveBeenCalled();
  });

  it("uses the caller's organization for the revision, portfolio, and shell", async () => {
    rows.push(member("VIEWER", "user_a"));
    setHeaders({ "x-user-id": "user_a", "x-organization-id": "org_a" });
    await RevisionPage({
      params: Promise.resolve({ revisionId: "rev_1" }),
      searchParams: Promise.resolve({}),
    });
    expect(getRevision).toHaveBeenCalledWith("org_a", "rev_1");
    expect(getDocument).toHaveBeenCalledWith("org_a", "doc_1");

    await ProjectsPage();
    expect(listProjects).toHaveBeenCalledWith("org_a");
    await ChangesPage();
    expect(getProjectReview).toHaveBeenCalledWith("org_a", "project_1");
    await EmailPage({ params: Promise.resolve({ projectId: "project_1", emailSendId: "email_1" }) });
    expect(readEmailSend).toHaveBeenCalledWith("org_a", "project_1", "email_1");

    const shell = await loadAppShell();
    expect(shell.projects.map((project) => project.id)).toEqual(["project_1"]);
    expect(shell.signedIn).toBe(true);
    expect(shell.canManagePeople).toBe(false);
    expect(listProjects).toHaveBeenCalledWith("org_a");
  });

  it("marks people management on the shell for an org admin", async () => {
    rows.push(member("ORG_ADMIN", "user_admin"));
    setHeaders({ "x-user-id": "user_admin", "x-organization-id": "org_a" });
    await expect(loadAppShell()).resolves.toMatchObject({ signedIn: true, canManagePeople: true });
  });

  it("leaves the shell empty when the caller is not a member", async () => {
    rows.push(member("ORG_ADMIN", "user_b", "org_b"));
    setHeaders({ "x-user-id": "user_b", "x-organization-id": "org_a" });
    await expect(loadAppShell()).resolves.toEqual({ projects: [], signedIn: false, canManagePeople: false });
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("opens the desk for the user on the session cookie, not a forged user header", async () => {
    const token = "desk-session-token";
    rows.push(member("VIEWER", "user_cookie"));
    rows.push(member("ORG_ADMIN", "user_b", "org_b"));
    setHeaders({ "x-user-id": "user_b", "x-organization-id": "org_a" });
    cookieState.set(SESSION_COOKIE, token);
    findValidSession.mockImplementation(async (tokenHash: string) =>
      tokenHash === hashToken(token) ? { userId: "user_cookie" } : null);
    const previous = process.env.AUTH_TRUST_USER_HEADER;
    delete process.env.AUTH_TRUST_USER_HEADER;
    try {
      await ProjectPage(projectProps("heavyjob"));
      expect(listHeavyJobSourceObjects).toHaveBeenCalledWith("org_a", "project_1");
    } finally {
      if (previous === undefined) delete process.env.AUTH_TRUST_USER_HEADER;
      else process.env.AUTH_TRUST_USER_HEADER = previous;
    }
  });

  it("does not open the seeded demo desk when the page has no session", async () => {
    process.env.APP_ORGANIZATION_ID = "org_demo";
    rows.push(member("VIEWER", DEMO_USER_ID, "org_demo"));
    const previous = process.env.AUTH_TRUST_USER_HEADER;
    delete process.env.AUTH_TRUST_USER_HEADER;
    try {
      await expect(ProjectPage(projectProps("heavyjob"))).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;401",
      });
      expect(listHeavyJobSourceObjects).not.toHaveBeenCalled();
      await expect(loadAppShell()).resolves.toEqual({ projects: [], signedIn: false, canManagePeople: false });
      expect(listProjects).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.AUTH_TRUST_USER_HEADER;
      else process.env.AUTH_TRUST_USER_HEADER = previous;
    }
  });
});
