import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as acceptInvite } from "@/app/api/auth/accept/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as uploadRevision } from "@/app/api/documents/[documentId]/revisions/route";
import { POST as refreshAcceptToken } from "@/app/api/org/memberships/[membershipId]/accept-token/route";
import { POST as disableMember } from "@/app/api/org/memberships/[membershipId]/disable/route";
import { POST as enableMember } from "@/app/api/org/memberships/[membershipId]/enable/route";
import { POST as changeRole } from "@/app/api/org/memberships/[membershipId]/role/route";
import { GET as listMemberships, POST as inviteMember } from "@/app/api/org/memberships/route";
import { POST as createDocumentRoute } from "@/app/api/projects/[projectId]/documents/route";
import { GET as emailDraft } from "@/app/api/projects/[projectId]/email-draft/route";
import { GET as readEmail, PATCH as patchEmail } from "@/app/api/projects/[projectId]/emails/[emailSendId]/route";
import { POST as createEmail } from "@/app/api/projects/[projectId]/emails/route";
import { POST as uploadAppendix } from "@/app/api/projects/[projectId]/export/appendices/route";
import { POST as uploadChapter } from "@/app/api/projects/[projectId]/export/chapters/route";
import { GET as exportPack } from "@/app/api/projects/[projectId]/export/route";
import { GET as readPacket } from "@/app/api/projects/[projectId]/export-packets/[exportPacketId]/route";
import { GET as listHeavyJob } from "@/app/api/projects/[projectId]/heavyjob-objects/route";
import { GET as readReviews, POST as writeReview } from "@/app/api/projects/[projectId]/reviews/route";
import { GET as previewPage } from "@/app/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]/route";
import { GET as readState } from "@/app/api/projects/[projectId]/state/route";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import ChangesPage from "@/app/(desk)/changes/page";
import DocumentPage from "@/app/(desk)/documents/[documentId]/page";
import DeskLayout from "@/app/(desk)/layout";
import PeoplePage from "@/app/(desk)/people/page";
import EmailPage from "@/app/(desk)/projects/[projectId]/emails/[emailSendId]/page";
import ProjectPage from "@/app/(desk)/projects/[projectId]/page";
import ProjectsPage from "@/app/(desk)/projects/page";
import RevisionPage from "@/app/(desk)/revisions/[revisionId]/page";
import { ProjectContext } from "@/components/workspace/project-context";
import { hashPassword } from "@/lib/auth/password";
import { hashToken, newSecret, SESSION_COOKIE } from "@/lib/auth/sessionToken";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { createDocument } from "@/lib/documents/service";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { advanceExtractionRun, createExtractionRun } from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";
import { recordReviewDecision } from "@/lib/review/service";
import { loadAppShell } from "@/lib/workspace/appShellData";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

/**
 * Cross-org cases that still disclose org A. Leave empty when every case
 * returns 404 or zero org-A rows. A real leak stays expected-failing until
 * the CTO decides on the fix. TODO: describe the route, method, and payload.
 */
const KNOWN_LEAKS: Record<string, string> = {};

const { headerState, cookieState } = vi.hoisted(() => ({
  headerState: new Map<string, string>(),
  cookieState: new Map<string, string>(),
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

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

type Fx = {
  orgA: string;
  orgB: string;
  userA: string;
  userB: string;
  emailA: string;
  emailB: string;
  invitedEmail: string;
  password: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  orgBProjectName: string;
  documentId: string;
  documentTitle: string;
  revisionId: string;
  revisionLabel: string;
  pageText: string;
  equipment: string;
  factId: string;
  decisionId: string;
  packetId: string;
  emailId: string;
  emailSubject: string;
  emailBody: string;
  chapterTitle: string;
  heavyNote: string;
  membershipId: string;
};

type RouteCase = {
  id: string;
  file: string;
  method: string;
  call: (fx: Fx) => Promise<Response>;
  check: (response: Response, fx: Fx, text: string, body: unknown) => Promise<void> | void;
};

type PageCase = {
  id: string;
  file: string;
  run: (fx: Fx) => Promise<void>;
};

const holder: { fx: Fx | null } = { fx: null };
const db = integrationDb();

function markers(fx: Fx) {
  return [
    fx.projectName,
    fx.projectNumber,
    fx.documentTitle,
    fx.revisionLabel,
    fx.pageText,
    fx.equipment,
    fx.emailSubject,
    fx.emailBody,
    fx.chapterTitle,
    fx.heavyNote,
    fx.emailA,
    fx.invitedEmail,
  ];
}

function assertNoMarkers(text: string, fx: Fx) {
  for (const marker of markers(fx)) expect(text, marker).not.toContain(marker);
}

function orgHeaders(organizationId: string, userId: string) {
  return { "x-user-id": userId, "x-organization-id": organizationId };
}

function asOrg(userId: string, organizationId: string) {
  headerState.clear();
  cookieState.clear();
  headerState.set("x-user-id", userId);
  headerState.set("x-organization-id", organizationId);
}

function jsonRequest(url: string, method: string, headers: Record<string, string>, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function pdfRequest(url: string, headers: Record<string, string>, revisionLabel?: string) {
  const form = new FormData();
  const pdf = buildTextPdf(["sheet"]);
  form.set("file", new File([new Uint8Array(pdf)], "sheet.pdf", { type: "application/pdf" }));
  if (revisionLabel) form.set("revisionLabel", revisionLabel);
  return new NextRequest(url, { method: "POST", headers, body: form });
}

function bHeaders(fx: Fx) {
  return orgHeaders(fx.orgB, fx.userB);
}

async function readJson(response: Response) {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { text, body };
}

function expectNotFound(response: Response, text: string, body: unknown) {
  expect(response.status, text).toBe(404);
  expect(body, text).toMatchObject({ error: { code: "NOT_FOUND" } });
}

async function orgASnapshot(fx: Fx) {
  const membership = await db.orgMembership.findUniqueOrThrow({ where: { id: fx.membershipId } });
  const email = await db.emailSend.findUniqueOrThrow({ where: { id: fx.emailId } });
  return {
    documents: await db.document.count({ where: { projectId: fx.projectId } }),
    revisions: await db.documentRevision.count({ where: { documentId: fx.documentId } }),
    decisions: await db.reviewDecision.count({ where: { projectId: fx.projectId } }),
    emails: await db.emailSend.count({ where: { projectId: fx.projectId } }),
    packets: await db.exportPacket.count({ where: { projectId: fx.projectId } }),
    chapters: await db.exportPacketChapter.count({ where: { projectId: fx.projectId } }),
    heavy: await db.heavyJobSourceObject.count({ where: { projectId: fx.projectId } }),
    role: membership.role,
    status: membership.status,
    token: membership.acceptTokenHash,
    subject: email.subject,
    body: email.body,
  };
}

function renderText(node: unknown, seen = new Set<unknown>(), out: string[] = []): string {
  if (node == null || typeof node === "boolean" || typeof node === "function" || typeof node === "symbol") {
    return out.join("\n");
  }
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out.join("\n");
  }
  if (typeof node !== "object" || seen.has(node)) return out.join("\n");
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) renderText(item, seen, out);
    return out.join("\n");
  }
  for (const value of Object.values(node as Record<string, unknown>)) renderText(value, seen, out);
  return out.join("\n");
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

const routeCases: RouteCase[] = [
  {
    id: "app/api/auth/accept/route.ts#POST",
    file: "app/api/auth/accept/route.ts",
    method: "POST",
    call: (fx) => acceptInvite(jsonRequest("http://localhost/api/auth/accept", "POST", bHeaders(fx), {
      token: "not-an-org-a-invite-token",
      password: fx.password,
      name: "Org B",
    })),
    check: (response, _fx, text) => {
      expect(response.status, text).toBeGreaterThanOrEqual(400);
      expect(response.status, text).toBeLessThan(500);
    },
  },
  {
    id: "app/api/auth/login/route.ts#POST",
    file: "app/api/auth/login/route.ts",
    method: "POST",
    call: (fx) => login(jsonRequest("http://localhost/api/auth/login", "POST", bHeaders(fx), {
      email: fx.emailB,
      password: fx.password,
    })),
    check: (response, fx, text, body) => {
      expect(response.status, text).toBe(200);
      expect(body).toMatchObject({ user: { id: fx.userB, email: fx.emailB, organizationId: fx.orgB } });
    },
  },
  {
    id: "app/api/auth/logout/route.ts#POST",
    file: "app/api/auth/logout/route.ts",
    method: "POST",
    call: async (fx) => {
      const token = newSecret();
      await db.session.create({
        data: {
          tokenHash: hashToken(token),
          userId: fx.userB,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      return logout(jsonRequest("http://localhost/api/auth/logout", "POST", { cookie: `${SESSION_COOKIE}=${token}` }));
    },
    check: (response, _fx, text, body) => {
      expect(response.status, text).toBe(200);
      expect(body).toEqual({ ok: true });
    },
  },
  {
    id: "app/api/documents/[documentId]/revisions/route.ts#POST",
    file: "app/api/documents/[documentId]/revisions/route.ts",
    method: "POST",
    call: (fx) => uploadRevision(
      pdfRequest(`http://localhost/api/documents/${fx.documentId}/revisions`, bHeaders(fx), "B"),
      params({ documentId: fx.documentId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/org/memberships/[membershipId]/accept-token/route.ts#POST",
    file: "app/api/org/memberships/[membershipId]/accept-token/route.ts",
    method: "POST",
    call: (fx) => refreshAcceptToken(
      jsonRequest(`http://localhost/api/org/memberships/${fx.membershipId}/accept-token`, "POST", bHeaders(fx)),
      params({ membershipId: fx.membershipId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/org/memberships/[membershipId]/disable/route.ts#POST",
    file: "app/api/org/memberships/[membershipId]/disable/route.ts",
    method: "POST",
    call: (fx) => disableMember(
      jsonRequest(`http://localhost/api/org/memberships/${fx.membershipId}/disable`, "POST", bHeaders(fx)),
      params({ membershipId: fx.membershipId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/org/memberships/[membershipId]/enable/route.ts#POST",
    file: "app/api/org/memberships/[membershipId]/enable/route.ts",
    method: "POST",
    call: (fx) => enableMember(
      jsonRequest(`http://localhost/api/org/memberships/${fx.membershipId}/enable`, "POST", bHeaders(fx)),
      params({ membershipId: fx.membershipId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/org/memberships/[membershipId]/role/route.ts#POST",
    file: "app/api/org/memberships/[membershipId]/role/route.ts",
    method: "POST",
    call: (fx) => changeRole(
      jsonRequest(`http://localhost/api/org/memberships/${fx.membershipId}/role`, "POST", bHeaders(fx), { role: "VIEWER" }),
      params({ membershipId: fx.membershipId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/org/memberships/route.ts#GET",
    file: "app/api/org/memberships/route.ts",
    method: "GET",
    call: (fx) => listMemberships(jsonRequest("http://localhost/api/org/memberships", "GET", bHeaders(fx))),
    check: (response, fx, text, body) => {
      expect(response.status, text).toBe(200);
      const people = (body as { people: { email: string }[] }).people;
      expect(people.map((person) => person.email)).toContain(fx.emailB);
      expect(people.map((person) => person.email)).not.toContain(fx.emailA);
      expect(people.map((person) => person.email)).not.toContain(fx.invitedEmail);
    },
  },
  {
    id: "app/api/org/memberships/route.ts#POST",
    file: "app/api/org/memberships/route.ts",
    method: "POST",
    call: (fx) => inviteMember(jsonRequest("http://localhost/api/org/memberships", "POST", bHeaders(fx), {
      email: `invite-${fx.orgB}@isolation.example`,
      name: "Org B Invite",
      role: "VIEWER",
    })),
    check: async (response, fx, text, body) => {
      expect(response.status, text).toBe(201);
      const membership = (body as { membership: { id: string; organizationId: string; email: string } }).membership;
      expect(membership.organizationId).toBe(fx.orgB);
      expect(membership.email).toBe(`invite-${fx.orgB}@isolation.example`);
      await db.orgMembership.delete({ where: { id: membership.id } });
      await db.user.delete({ where: { email: membership.email } });
    },
  },
  {
    id: "app/api/projects/[projectId]/documents/route.ts#POST",
    file: "app/api/projects/[projectId]/documents/route.ts",
    method: "POST",
    call: (fx) => createDocumentRoute(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/documents`, "POST", bHeaders(fx), { title: "Stolen plan" }),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/email-draft/route.ts#GET",
    file: "app/api/projects/[projectId]/email-draft/route.ts",
    method: "GET",
    call: (fx) => emailDraft(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/email-draft`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/emails/[emailSendId]/route.ts#GET",
    file: "app/api/projects/[projectId]/emails/[emailSendId]/route.ts",
    method: "GET",
    call: (fx) => readEmail(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/emails/${fx.emailId}`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId, emailSendId: fx.emailId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/emails/[emailSendId]/route.ts#PATCH",
    file: "app/api/projects/[projectId]/emails/[emailSendId]/route.ts",
    method: "PATCH",
    call: (fx) => patchEmail(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/emails/${fx.emailId}`, "PATCH", bHeaders(fx), {
        recipients: "pm@isolation.example",
        subject: "Changed by org B",
        body: "This draft was rewritten.",
        exportPacketId: fx.packetId,
        status: "DRAFT",
      }),
      params({ projectId: fx.projectId, emailSendId: fx.emailId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/emails/route.ts#POST",
    file: "app/api/projects/[projectId]/emails/route.ts",
    method: "POST",
    call: (fx) => createEmail(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/emails`, "POST", bHeaders(fx), {
        recipients: "pm@isolation.example",
        subject: "Org B draft",
        body: "Trying to file this on the other project.",
        exportPacketId: fx.packetId,
        status: "DRAFT",
      }),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/export/appendices/route.ts#POST",
    file: "app/api/projects/[projectId]/export/appendices/route.ts",
    method: "POST",
    call: (fx) => uploadAppendix(
      pdfRequest(`http://localhost/api/projects/${fx.projectId}/export/appendices`, bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/export/chapters/route.ts#POST",
    file: "app/api/projects/[projectId]/export/chapters/route.ts",
    method: "POST",
    call: (fx) => uploadChapter(
      pdfRequest(`http://localhost/api/projects/${fx.projectId}/export/chapters`, bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/export/route.ts#GET",
    file: "app/api/projects/[projectId]/export/route.ts",
    method: "GET",
    call: (fx) => exportPack(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/export`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/export-packets/[exportPacketId]/route.ts#GET",
    file: "app/api/projects/[projectId]/export-packets/[exportPacketId]/route.ts",
    method: "GET",
    call: (fx) => readPacket(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/export-packets/${fx.packetId}`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId, exportPacketId: fx.packetId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/heavyjob-objects/route.ts#GET",
    file: "app/api/projects/[projectId]/heavyjob-objects/route.ts",
    method: "GET",
    call: (fx) => listHeavyJob(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/heavyjob-objects`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/reviews/route.ts#GET",
    file: "app/api/projects/[projectId]/reviews/route.ts",
    method: "GET",
    call: (fx) => readReviews(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/reviews`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/reviews/route.ts#POST",
    file: "app/api/projects/[projectId]/reviews/route.ts",
    method: "POST",
    call: (fx) => writeReview(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/reviews`, "POST", bHeaders(fx), {
        decision: "ACCEPTED",
        subject: { type: "proposed_fact", proposedFactId: fx.factId },
      }),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]/route.ts#GET",
    file: "app/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]/route.ts",
    method: "GET",
    call: (fx) => previewPage(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/revisions/${fx.revisionId}/pages/1`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId, revisionId: fx.revisionId, pageNumber: "1" }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/[projectId]/state/route.ts#GET",
    file: "app/api/projects/[projectId]/state/route.ts",
    method: "GET",
    call: (fx) => readState(
      jsonRequest(`http://localhost/api/projects/${fx.projectId}/state`, "GET", bHeaders(fx)),
      params({ projectId: fx.projectId }),
    ),
    check: (response, _fx, text, body) => expectNotFound(response, text, body),
  },
  {
    id: "app/api/projects/route.ts#POST",
    file: "app/api/projects/route.ts",
    method: "POST",
    call: (fx) => createProjectRoute(jsonRequest("http://localhost/api/projects", "POST", bHeaders(fx), {
      name: `Org B created ${fx.orgB}`,
      projectNumber: "B-NEW",
    })),
    check: async (response, fx, text, body) => {
      expect(response.status, text).toBe(201);
      const project = (body as { project: { id: string; organizationId: string } }).project;
      expect(project.organizationId).toBe(fx.orgB);
      await db.project.delete({ where: { id: project.id } });
    },
  },
];

async function expectHiddenPage(run: () => Promise<unknown>) {
  try {
    const rendered = await run();
    throw new Error(`page rendered instead of 404: ${renderText(rendered).slice(0, 400)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("page rendered")) throw error;
    expect((error as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  }
}

function expectVisibleAggregate(rendered: unknown, fx: Fx) {
  const text = renderText(rendered);
  assertNoMarkers(text, fx);
  expect(text).toContain(fx.orgBProjectName);
}

const pageCases: PageCase[] = [
  {
    id: "app/(desk)/projects/page.tsx",
    file: "app/(desk)/projects/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      expectVisibleAggregate(await ProjectsPage(), fx);
    },
  },
  {
    id: "app/(desk)/changes/page.tsx",
    file: "app/(desk)/changes/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      const text = renderText(await ChangesPage());
      assertNoMarkers(text, fx);
      expect(text).not.toContain(fx.projectId);
      expect(text.replaceAll("\n", "")).toContain("0 open");
    },
  },
  {
    id: "app/(desk)/projects/[projectId]/page.tsx",
    file: "app/(desk)/projects/[projectId]/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      await expectHiddenPage(() => ProjectPage({
        params: Promise.resolve({ projectId: fx.projectId }),
        searchParams: Promise.resolve({}),
      }));
    },
  },
  {
    id: "app/(desk)/documents/[documentId]/page.tsx",
    file: "app/(desk)/documents/[documentId]/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      await expectHiddenPage(() => DocumentPage({
        params: Promise.resolve({ documentId: fx.documentId }),
        searchParams: Promise.resolve({}),
      }));
    },
  },
  {
    id: "app/(desk)/revisions/[revisionId]/page.tsx",
    file: "app/(desk)/revisions/[revisionId]/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      await expectHiddenPage(() => RevisionPage({
        params: Promise.resolve({ revisionId: fx.revisionId }),
        searchParams: Promise.resolve({}),
      }));
    },
  },
  {
    id: "app/(desk)/projects/[projectId]/emails/[emailSendId]/page.tsx",
    file: "app/(desk)/projects/[projectId]/emails/[emailSendId]/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      await expectHiddenPage(() => EmailPage({
        params: Promise.resolve({ projectId: fx.projectId, emailSendId: fx.emailId }),
      }));
    },
  },
  {
    id: "app/(desk)/people/page.tsx",
    file: "app/(desk)/people/page.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      const text = renderText(await PeoplePage());
      assertNoMarkers(text, fx);
      expect(text).toContain(fx.emailB);
    },
  },
  {
    id: "app/(desk)/layout.tsx",
    file: "app/(desk)/layout.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      const rendered = await DeskLayout({ children: "desk-child" });
      expect(renderText(rendered)).toContain("desk-child");
      assertNoMarkers(renderText(rendered), fx);
    },
  },
  {
    id: "components/workspace/project-context.tsx",
    file: "components/workspace/project-context.tsx",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      expectVisibleAggregate(await ProjectContext({ projectId: fx.projectId, children: "crumb" }), fx);
    },
  },
  {
    id: "lib/workspace/appShellData.ts#loadAppShell",
    file: "lib/workspace/appShellData.ts",
    run: async (fx) => {
      asOrg(fx.userB, fx.orgB);
      const shell = await loadAppShell();
      const text = JSON.stringify(shell);
      assertNoMarkers(text, fx);
      expect(shell.projects.map((project) => project.id)).not.toContain(fx.projectId);
      expect(shell.projects.map((project) => project.name)).toContain(fx.orgBProjectName);
      expect(shell.projects.reduce((sum, project) => sum + project.openCount, 0)).toBe(0);
    },
  },
];

function rel(file: string) {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function exportedMethods(source: string) {
  return HTTP_METHODS.filter((method) => (
    new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(source)
    || new RegExp(`export\\s+function\\s+${method}\\b`).test(source)
    || new RegExp(`export\\s+const\\s+${method}\\b`).test(source)
  ));
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a usable URL for the cross-org test.");
  }
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error(`Refusing cross-org test against non-local database host ${host}.`);
  }
  if (process.env.OBJECT_STORAGE_BUCKET || process.env.DOCUMENT_STORAGE_BUCKET) {
    throw new Error("Refusing cross-org test while an object storage bucket is configured.");
  }
}

describe("cross-org route and page coverage", () => {
  it("fails when a route method, desk page, or server action has no matrix entry", () => {
    const root = process.cwd();
    const routeFiles = walk(path.join(root, "app/api"))
      .filter((file) => file.endsWith(`${path.sep}route.ts`))
      .map(rel)
      .sort();
    const pageFiles = walk(path.join(root, "app/(desk)"))
      .filter((file) => file.endsWith(`${path.sep}page.tsx`))
      .map(rel)
      .sort();
    const coveredMethods = new Set(routeCases.map((entry) => `${entry.file}#${entry.method}`));
    const missingMethods: string[] = [];
    for (const file of routeFiles) {
      const methods = exportedMethods(readFileSync(path.join(root, file), "utf8"));
      expect(methods.length, file).toBeGreaterThan(0);
      for (const method of methods) {
        if (!coveredMethods.has(`${file}#${method}`)) missingMethods.push(`${file}#${method}`);
      }
    }
    expect(missingMethods).toEqual([]);
    const extraMethods = [...coveredMethods].filter((id) => {
      const [file, method] = id.split("#");
      if (!file || !method || !routeFiles.includes(file)) return true;
      return !exportedMethods(readFileSync(path.join(root, file), "utf8")).includes(method as typeof HTTP_METHODS[number]);
    });
    expect(extraMethods).toEqual([]);
    const coveredPages = new Set(pageCases.map((entry) => entry.file));
    expect(pageFiles.filter((file) => !coveredPages.has(file))).toEqual([]);
    for (const file of ["app/(desk)/layout.tsx", "components/workspace/project-context.tsx", "lib/workspace/appShellData.ts"]) {
      expect(coveredPages.has(file), file).toBe(true);
    }
    const useServer = ["app", "components", "lib"].flatMap((dir) => walk(path.join(root, dir)))
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => /^\s*["']use server["'];/m.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(useServer).toEqual([]);
    expect(routeFiles).toHaveLength(22);
    expect(pageFiles).toHaveLength(7);
  });
});

describe.skipIf(!hasIntegrationDatabase)("cross-org isolation", () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const orgA = `it_iso_a_${suffix}`;
  const orgB = `it_iso_b_${suffix}`;

  beforeAll(async () => {
    assertLocalDatabase();
    process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "1";
    const repository = new PrismaConstructionRepository(db);
    const password = "isolation-pass-1";
    const passwordHash = await hashPassword(password);
    const emailA = `orga-${suffix}@isolation.example`;
    const emailB = `orgb-${suffix}@isolation.example`;
    const invitedEmail = `invited-${suffix}@isolation.example`;
    const userA = `user_a_${suffix}`;
    const userB = `user_b_${suffix}`;
    const invitedId = `user_inv_${suffix}`;
    const membershipId = `membership_inv_${suffix}`;
    const projectName = `ORGA_PROJECT_${suffix}`;
    const projectNumber = `ORGA-NUM-${suffix}`;
    const orgBProjectName = `ORGB_PROJECT_${suffix}`;
    const documentTitle = `ORGA_DOC_${suffix}`;
    const revisionLabel = `ORGA-REV-${suffix}`;
    const pageText = `ORGA_PAGE_${suffix}`;
    const equipment = `ORGA_EQUIP_${suffix}`;
    const emailSubject = `ORGA_EMAIL_${suffix}`;
    const emailBody = `ORGA_BODY_${suffix}`;
    const chapterTitle = `ORGA_CHAPTER_${suffix}`;
    const heavyNote = `ORGA_HEAVY_${suffix}`;

    await db.organization.create({ data: { id: orgA, name: `Org A ${suffix}` } });
    await db.organization.create({ data: { id: orgB, name: `Org B ${suffix}` } });
    await db.user.create({ data: { id: userA, email: emailA, name: `Org A Admin ${suffix}`, passwordHash } });
    await db.user.create({ data: { id: userB, email: emailB, name: `Org B Admin ${suffix}`, passwordHash } });
    await db.user.create({ data: { id: invitedId, email: invitedEmail, name: `Org A Invite ${suffix}` } });
    await db.orgMembership.create({
      data: { organizationId: orgA, userId: userA, role: "ORG_ADMIN", status: "ACTIVE" },
    });
    await db.orgMembership.create({
      data: { organizationId: orgB, userId: userB, role: "ORG_ADMIN", status: "ACTIVE" },
    });
    await db.orgMembership.create({
      data: {
        id: membershipId,
        organizationId: orgA,
        userId: invitedId,
        role: "CONTRIBUTOR",
        status: "INVITED",
        acceptTokenHash: hashToken(newSecret()),
        acceptTokenExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const project = await createProject(orgA, { name: projectName, projectNumber }, repository);
    await createProject(orgB, { name: orgBProjectName, projectNumber: "B-1" }, repository);
    const document = await createDocument(orgA, project.id, { title: documentTitle, documentType: "Plan" }, repository);
    const revision = await repository.createRevision({
      organizationId: orgA,
      documentId: document.id,
      revisionLabel,
      originalFilename: "orga.pdf",
      mimeType: "application/pdf",
      byteSize: pageText.length,
      sha256: `a${suffix}`.padEnd(64, "0").slice(0, 64),
      storageKey: `revisions/isolation-${suffix}.pdf`,
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: pageText, textSha256: "e".repeat(64) }],
    });
    const run = await createExtractionRun(orgA, revision.id, {
      extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
      extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
      provider: "openai",
      model: "gpt-4.1",
    }, repository);
    await advanceExtractionRun(orgA, run.id, { status: "RUNNING" }, repository);
    await recordProposedFacts(orgA, run.id, [{
      type: "equipment_requirement",
      equipment,
      statement: pageText,
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: pageText, startOffset: 0, endOffset: pageText.length }],
    }], repository);
    const fact = await db.proposedFact.findFirstOrThrow({ where: { extractionRunId: run.id } });
    const decision = await recordReviewDecision(orgA, project.id, userA, {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: fact.id },
    }, repository);
    const payload = Buffer.from(JSON.stringify({ secret: chapterTitle, equipment }));
    const packet = await db.exportPacket.create({
      data: {
        projectId: project.id,
        contentHash: `b${suffix}`.padEnd(64, "1").slice(0, 64),
        storageKey: `isolation/${suffix}/pack.json`,
        payload,
        byteSize: payload.byteLength,
        decisions: { create: [{ reviewDecisionId: decision.id, ordinal: 0 }] },
      },
    });
    const email = await repository.createEmailSend({
      organizationId: orgA,
      projectId: project.id,
      exportPacketId: packet.id,
      status: "DRAFT",
      recipients: [`pm-${suffix}@isolation.example`],
      subject: emailSubject,
      body: emailBody,
      actorId: userA,
      documentIds: [document.id],
      reviewDecisionIds: [decision.id],
      createdAt: new Date("2026-10-20T00:00:00.000Z"),
      sentAt: null,
    });
    if (!email) throw new Error("Org A email fixture was not created.");
    await db.exportPacketChapter.create({
      data: {
        projectId: project.id,
        role: "acc-docs",
        title: chapterTitle,
        sourceId: `src-${suffix}`,
        fetchedAt: new Date("2026-10-20T00:00:00.000Z"),
        contentHash: `c${suffix}`.padEnd(64, "2").slice(0, 64),
        storageKey: `isolation/${suffix}/chapter.pdf`,
        filename: "chapter.pdf",
        byteSize: 4,
      },
    });
    await db.heavyJobSourceObject.create({
      data: {
        projectId: project.id,
        objectType: "diary",
        sourceId: `hj-${suffix}`,
        fetchedAt: new Date("2026-10-20T00:00:00.000Z"),
        raw: { note: heavyNote },
      },
    });

    holder.fx = {
      orgA,
      orgB,
      userA,
      userB,
      emailA,
      emailB,
      invitedEmail,
      password,
      projectId: project.id,
      projectName,
      projectNumber,
      orgBProjectName,
      documentId: document.id,
      documentTitle,
      revisionId: revision.id,
      revisionLabel,
      pageText,
      equipment,
      factId: fact.id,
      decisionId: decision.id,
      packetId: packet.id,
      emailId: email.id,
      emailSubject,
      emailBody,
      chapterTitle,
      heavyNote,
      membershipId,
    };
  }, 60_000);

  afterAll(async () => {
    const projects = await db.project.findMany({
      where: { organizationId: { in: [orgA, orgB] } },
      select: { id: true },
    });
    const projectIds = projects.map(({ id }) => id);
    await db.emailSendDecision.deleteMany({ where: { emailSend: { projectId: { in: projectIds } } } });
    await db.emailSendDocument.deleteMany({ where: { emailSend: { projectId: { in: projectIds } } } });
    await db.emailSend.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.exportPacketChapterDecision.deleteMany({ where: { chapter: { projectId: { in: projectIds } } } });
    await db.exportPacketChapter.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.exportPacketDecision.deleteMany({ where: { exportPacket: { projectId: { in: projectIds } } } });
    await db.exportPacket.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.heavyJobSourceObject.deleteMany({ where: { projectId: { in: projectIds } } });
    const decisions = await db.reviewDecision.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    for (const decision of decisions) await db.reviewDecision.delete({ where: { id: decision.id } });
    const documents = await db.document.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const documentIds = documents.map(({ id }) => id);
    const revisions = await db.documentRevision.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
    const revisionIds = revisions.map(({ id }) => id);
    const runs = await db.extractionRun.findMany({ where: { documentRevisionId: { in: revisionIds } }, select: { id: true } });
    const runIds = runs.map(({ id }) => id);
    await db.proposedFactEvidence.deleteMany({ where: { proposedFact: { extractionRunId: { in: runIds } } } });
    await db.proposedFact.deleteMany({ where: { extractionRunId: { in: runIds } } });
    await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentPage.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentRevision.deleteMany({ where: { id: { in: revisionIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    const users = await db.user.findMany({
      where: { email: { contains: suffix } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.loginAttempt.deleteMany({ where: { email: { contains: suffix } } });
    await db.orgMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
  });

  function fx() {
    if (!holder.fx) throw new Error("Cross-org fixture was not seeded.");
    return holder.fx;
  }

  it("shows org A its own review, HeavyJob note, and email", async () => {
    const current = fx();
    const headers = orgHeaders(current.orgA, current.userA);
    const reviews = await readReviews(
      jsonRequest(`http://localhost/api/projects/${current.projectId}/reviews`, "GET", headers),
      params({ projectId: current.projectId }),
    );
    const reviewText = await reviews.text();
    expect(reviews.status, reviewText).toBe(200);
    expect(reviewText).toContain(current.equipment);
    expect(reviewText).toContain(current.pageText);

    const heavy = await listHeavyJob(
      jsonRequest(`http://localhost/api/projects/${current.projectId}/heavyjob-objects`, "GET", headers),
      params({ projectId: current.projectId }),
    );
    const heavyText = await heavy.text();
    expect(heavy.status, heavyText).toBe(200);
    expect(heavyText).toContain(current.heavyNote);

    const email = await readEmail(
      jsonRequest(`http://localhost/api/projects/${current.projectId}/emails/${current.emailId}`, "GET", headers),
      params({ projectId: current.projectId, emailSendId: current.emailId }),
    );
    const emailText = await email.text();
    expect(email.status, emailText).toBe(200);
    expect(emailText).toContain(current.emailSubject);
    expect(emailText).toContain(current.emailBody);
  });

  it("createRevision writes nothing when the document belongs to another organization", async () => {
    const current = fx();
    const repository = new PrismaConstructionRepository(db);
    const before = await orgASnapshot(current);
    const revisionCount = await db.documentRevision.count({ where: { documentId: current.documentId } });
    const pageCount = await db.documentPage.count({ where: { documentRevision: { documentId: current.documentId } } });
    await expect(repository.createRevision({
      organizationId: current.orgB,
      documentId: current.documentId,
      revisionLabel: `STOLEN-${current.revisionLabel}`,
      originalFilename: "stolen.pdf",
      mimeType: "application/pdf",
      byteSize: 8,
      sha256: "f".repeat(64),
      storageKey: `revisions/stolen-${current.orgB}.pdf`,
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: "stolen", textSha256: "d".repeat(64) }],
    })).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404, message: "Document not found." });
    expect(await db.documentRevision.count({ where: { documentId: current.documentId } })).toBe(revisionCount);
    expect(await db.documentPage.count({ where: { documentRevision: { documentId: current.documentId } } })).toBe(pageCount);
    expect(await orgASnapshot(current)).toEqual(before);
  });

  it("assertEmailLinks writes nothing when the project belongs to another organization", async () => {
    const current = fx();
    const repository = new PrismaConstructionRepository(db);
    const before = await orgASnapshot(current);
    const emailCount = await db.emailSend.count({ where: { projectId: current.projectId } });
    const documentLinkCount = await db.emailSendDocument.count({ where: { documentId: current.documentId } });
    const decisionLinkCount = await db.emailSendDecision.count({ where: { reviewDecisionId: current.decisionId } });
    await expect(repository.createEmailSend({
      organizationId: current.orgB,
      projectId: current.projectId,
      exportPacketId: current.packetId,
      status: "DRAFT",
      recipients: ["stolen@isolation.example"],
      subject: "stolen",
      body: "stolen",
      actorId: current.userB,
      documentIds: [current.documentId],
      reviewDecisionIds: [current.decisionId],
      createdAt: new Date("2026-10-20T01:00:00.000Z"),
      sentAt: null,
    })).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404, message: "Project not found." });
    expect(await db.emailSend.count({ where: { projectId: current.projectId } })).toBe(emailCount);
    expect(await db.emailSendDocument.count({ where: { documentId: current.documentId } })).toBe(documentLinkCount);
    expect(await db.emailSendDecision.count({ where: { reviewDecisionId: current.decisionId } })).toBe(decisionLinkCount);
    expect(await orgASnapshot(current)).toEqual(before);
  });

  function register(id: string, run: () => Promise<void>) {
    const leak = KNOWN_LEAKS[id];
    if (!leak) {
      it(id, run);
      return;
    }
    // Expected failure until the leak is fixed. A passing assertion means the TODO is stale.
    it(`TODO leak: ${id} — ${leak}`, async () => {
      try {
        await run();
      } catch {
        return;
      }
      throw new Error(`Expected cross-org leak is gone: ${id}. ${leak}`);
    });
  }

  for (const entry of routeCases) {
    register(entry.id, async () => {
      const current = fx();
      const before = await orgASnapshot(current);
      const response = await entry.call(current);
      const { text, body } = await readJson(response);
      assertNoMarkers(text, current);
      await entry.check(response, current, text, body);
      expect(await orgASnapshot(current)).toEqual(before);
    });
  }

  for (const entry of pageCases) {
    register(entry.id, async () => {
      const current = fx();
      const before = await orgASnapshot(current);
      await entry.run(current);
      expect(await orgASnapshot(current)).toEqual(before);
    });
  }
});
