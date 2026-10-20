import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } from "./uploadLimit";

const { authorizeRequest, publishRevision, attachAccPdfChapter, attachBluebeamMarkupAppendix } = vi.hoisted(() => ({
  authorizeRequest: vi.fn(),
  publishRevision: vi.fn(),
  attachAccPdfChapter: vi.fn(),
  attachBluebeamMarkupAppendix: vi.fn(),
}));

vi.mock("@/lib/auth/membership", () => ({ authorizeRequest }));
vi.mock("@/lib/documents/publishRevision", () => ({ publishRevision }));
vi.mock("@/lib/review/accChapter", () => ({ attachAccPdfChapter }));
vi.mock("@/lib/review/bluebeamAppendix", () => ({ attachBluebeamMarkupAppendix }));

import { POST as postAppendix } from "@/app/api/projects/[projectId]/export/appendices/route";
import { POST as postChapter } from "@/app/api/projects/[projectId]/export/chapters/route";
import { POST as postRevision } from "@/app/api/documents/[documentId]/revisions/route";

function request(init: { length?: string; formData?: () => Promise<FormData> } = {}) {
  const headers = new Headers();
  if (init.length) headers.set("content-length", init.length);
  return {
    headers,
    formData: init.formData ?? (() => Promise.reject(new Error("body should not be read"))),
  } as unknown as NextRequest;
}

async function post(kind: "revision" | "chapter" | "appendix", incoming: NextRequest) {
  if (kind === "revision") return postRevision(incoming, { params: Promise.resolve({ documentId: "doc_1" }) });
  if (kind === "chapter") return postChapter(incoming, { params: Promise.resolve({ projectId: "project_1" }) });
  return postAppendix(incoming, { params: Promise.resolve({ projectId: "project_1" }) });
}

const routes = ["revision", "chapter", "appendix"] as const;

describe("upload routes reject oversized bodies", () => {
  beforeEach(() => {
    authorizeRequest.mockResolvedValue({ organizationId: "org_a", userId: "user_a", role: "ADMIN", named: true });
    publishRevision.mockReset();
    attachAccPdfChapter.mockReset();
    attachBluebeamMarkupAppendix.mockReset();
    publishRevision.mockRejectedValue(new Error("ingest should not run"));
    attachAccPdfChapter.mockRejectedValue(new Error("chapter ingest should not run"));
    attachBluebeamMarkupAppendix.mockRejectedValue(new Error("appendix ingest should not run"));
  });

  it.each(routes)("returns 413 JSON for a body over the platform cap on %s", async (kind) => {
    const response = await post(kind, request({ length: "20971520" }));
    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: { code: "FILE_TOO_LARGE", message: UPLOAD_TOO_LARGE_MESSAGE },
    });
    expect(publishRevision).not.toHaveBeenCalled();
    expect(attachAccPdfChapter).not.toHaveBeenCalled();
    expect(attachBluebeamMarkupAppendix).not.toHaveBeenCalled();
  });

  it.each(routes)("returns 413 JSON when the parsed file is over the cap on %s", async (kind) => {
    const file = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_UPLOAD_BYTES + 1 });
    const form = new FormData();
    form.set("file", file);
    form.set("revisionLabel", "C");
    const response = await post(kind, request({ length: "1200", formData: async () => form }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: "FILE_TOO_LARGE", message: "This file is over 4.5 MB. Large plan sets are coming soon." },
    });
    expect(publishRevision).not.toHaveBeenCalled();
    expect(attachAccPdfChapter).not.toHaveBeenCalled();
    expect(attachBluebeamMarkupAppendix).not.toHaveBeenCalled();
  });

  it("still reads a small revision body", async () => {
    const response = await post("revision", request({ length: "1200", formData: async () => new FormData() }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(publishRevision).not.toHaveBeenCalled();
  });
});
