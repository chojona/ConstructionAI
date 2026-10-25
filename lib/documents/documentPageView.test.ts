import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentDetail, RevisionRecord } from "@/lib/domain/types";

const { getDocument, getProjectReview, listProjects } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getProjectReview: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  usePathname: () => "/documents/doc_1",
  useRouter: () => ({
    push() { return undefined; },
    refresh() { return undefined; },
  }),
}));

vi.mock("@/lib/auth/pageAccess", () => ({
  authorizePage: async () => ({ organizationId: "org_a", userId: "user_a" }),
}));

vi.mock("@/lib/documents/service", () => ({ getDocument }));
vi.mock("@/lib/review/service", () => ({ getProjectReview }));
vi.mock("@/lib/projects/service", () => ({ listProjects }));
vi.mock("@/components/workspace/project-context", () => ({
  ProjectContext: ({ children }: { children: unknown }) => children,
}));

import DocumentPage from "@/app/(desk)/documents/[documentId]/page";

function revision(overrides: Partial<RevisionRecord> & Pick<RevisionRecord, "id" | "revisionLabel" | "revisionOrder" | "status">): RevisionRecord {
  return {
    documentId: "doc_1",
    originalFilename: `${overrides.revisionLabel}.pdf`,
    mimeType: "application/pdf",
    byteSize: 1200,
    sha256: "a".repeat(64),
    storageKey: "key",
    failureCode: null,
    failureMessage: null,
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
    ...overrides,
  };
}

function document(revisions: RevisionRecord[]): DocumentDetail {
  return {
    id: "doc_1",
    projectId: "project_1",
    title: "Drainage Plan",
    documentType: "Plan",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-04T00:00:00.000Z"),
    project: { id: "project_1", name: "River Crossing" },
    revisions,
  };
}

const failedOnly = revision({
  id: "rev_c",
  revisionLabel: "C",
  revisionOrder: 1,
  status: "FAILED",
  originalFilename: "drainage-failed.pdf",
  failureCode: "SCANNED_OR_EMPTY",
  failureMessage: "No usable embedded text was found.",
  createdAt: new Date("2026-10-04T00:00:00.000Z"),
});

const processedV1 = revision({
  id: "rev_a",
  revisionLabel: "A",
  revisionOrder: 1,
  status: "PROCESSED",
  originalFilename: "drainage-v1.pdf",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
});

function laterUpload(status: "FAILED" | "PROCESSING") {
  return revision({
    id: "rev_c",
    revisionLabel: "C",
    revisionOrder: 2,
    status,
    originalFilename: "drainage-v2.pdf",
    failureCode: status === "FAILED" ? "SCANNED_OR_EMPTY" : null,
    failureMessage: status === "FAILED" ? "No usable embedded text was found." : null,
    createdAt: new Date("2026-10-04T00:00:00.000Z"),
  });
}

async function renderPage(revisions: RevisionRecord[]) {
  getDocument.mockResolvedValue(document(revisions));
  const html = renderToStaticMarkup(await DocumentPage({
    params: Promise.resolve({ documentId: "doc_1" }),
    searchParams: Promise.resolve({}),
  }));
  return html;
}

function region(html: string, startMarker: string, endMarker?: string) {
  const start = html.indexOf(startMarker);
  if (start < 0) return "";
  if (!endMarker) return html.slice(start);
  const end = html.indexOf(endMarker, start + startMarker.length);
  return html.slice(start, end < 0 ? undefined : end);
}

beforeEach(() => {
  getDocument.mockReset();
  getProjectReview.mockReset();
  getProjectReview.mockResolvedValue({ findings: [] });
  listProjects.mockReset();
  listProjects.mockResolvedValue([{ id: "project_1", name: "River Crossing", projectNumber: "NS-1" }]);
});

describe("document page header", () => {
  it("shows no Current pill when the only revision failed", async () => {
    const html = await renderPage([failedOnly]);
    const header = region(html, '<section class="document-context">', "</section>");
    const lede = region(html, '<p class="lede">', "</p>");
    const history = region(html, 'id="history-heading"');

    expect(header).toContain("No current revision");
    expect(header).not.toContain("status-label");
    expect(header).not.toContain(">Current<");
    expect(header).not.toContain("drainage-failed.pdf");
    expect(lede).not.toContain("is Current");
    expect(lede).not.toContain("is Failed");
    expect(history).toContain('status-failed">Failed<');
    expect(history).toContain("drainage-failed.pdf");
    expect(history).toContain("selectable text");
  });

  it.each(["FAILED", "PROCESSING"] as const)("keeps processed v1 in the header when v2 is %s", async (status) => {
    const html = await renderPage([laterUpload(status), processedV1]);
    const header = region(html, '<section class="document-context">', "</section>");
    const lede = region(html, '<p class="lede">', "</p>");
    const history = region(html, 'id="history-heading"');
    const pill = status === "FAILED" ? 'status-failed">Failed<' : 'status-pending">Processing<';

    expect(header).toContain('status-processed">Current<');
    expect(header).toContain("<h2>A</h2>");
    expect(header).toContain("drainage-v1.pdf · Uploaded Sep 1, 2026");
    expect(header).not.toContain("drainage-v2.pdf");
    expect(header).not.toContain("Oct 4, 2026");
    expect(header).not.toContain(">Failed<");
    expect(header).not.toContain(">Processing<");
    expect(lede).toContain("A is Current, uploaded Sep 1, 2026.");
    expect(lede).not.toContain("drainage-v2.pdf");
    expect(history).toContain(pill);
    expect(history).toContain("drainage-v2.pdf");
    expect(history).toContain('status-processed">Current<');
  });
});
