import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { UploadRevisionForm } from "@/components/forms/upload-revision-form";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_HELPER_TEXT,
  UPLOAD_TOO_LARGE_MESSAGE,
  completeUploadAttempt,
  uploadBodyTooLarge,
  uploadFileTooLarge,
} from "./uploadLimit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

const fallback = "Could not upload revision.";

function attempt(file: { size: number } | null, send: () => Promise<Response>) {
  return completeUploadAttempt({ file, fallbackError: fallback, send });
}

describe("upload limit", () => {
  it("shows the real limit on the upload forms", () => {
    const revision = renderToStaticMarkup(createElement(UploadRevisionForm, { documentId: "doc_1" }));
    const created = renderToStaticMarkup(createElement(CreateDocumentForm, { projectId: "project_1" }));
    for (const html of [revision, created]) {
      expect(html).toContain(UPLOAD_HELPER_TEXT);
      expect(html).toContain("PDF up to 4 MB. The file needs selectable text.");
      expect(html).not.toContain("20 MB");
      expect(html).not.toContain("Processing");
      expect(html).not.toContain("Adding…");
    }
    expect(revision).toContain("Upload revision");
    expect(created).toContain("Add document");
  });

  it("rejects an oversized file on the client and resets the button", async () => {
    const send = vi.fn();
    const outcome = await attempt({ size: MAX_UPLOAD_BYTES + 1 }, send);
    expect(send).not.toHaveBeenCalled();
    expect(uploadFileTooLarge({ size: MAX_UPLOAD_BYTES + 1 })).toBe(true);
    expect(uploadFileTooLarge({ size: MAX_UPLOAD_BYTES })).toBe(false);
    expect(outcome).toMatchObject({ ok: false, pending: false, error: UPLOAD_TOO_LARGE_MESSAGE, status: null });
  });

  it("handles a non-JSON 413 and resets the button", async () => {
    const outcome = await attempt({ size: 100 }, async () => new Response("<html>FUNCTION_PAYLOAD_TOO_LARGE</html>", {
      status: 413,
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    expect(outcome).toMatchObject({
      ok: false,
      pending: false,
      error: "This file is over 4 MB. For now, split it into smaller PDFs by discipline or sheet range. Large plan sets are coming soon.",
      status: 413,
    });
  });

  it("handles a JSON 413 and resets the button", async () => {
    const outcome = await attempt({ size: 100 }, async () => Response.json(
      { error: { code: "FILE_TOO_LARGE", message: "platform rejected the body" } },
      { status: 413 },
    ));
    expect(outcome).toMatchObject({ ok: false, pending: false, error: UPLOAD_TOO_LARGE_MESSAGE, status: 413 });
  });

  it("handles a non-JSON error and resets the button", async () => {
    const outcome = await attempt({ size: 100 }, async () => new Response("bad gateway", {
      status: 502,
      headers: { "content-type": "text/plain" },
    }));
    expect(outcome).toMatchObject({ ok: false, pending: false, error: fallback, status: 502 });
  });

  it("handles invalid JSON and resets the button", async () => {
    const outcome = await attempt({ size: 100 }, async () => new Response("{", {
      status: 500,
      headers: { "content-type": "application/json" },
    }));
    expect(outcome).toMatchObject({ ok: false, pending: false, error: fallback, status: 500 });
  });

  it("resets the button when the network fails", async () => {
    const outcome = await attempt({ size: 100 }, async () => {
      throw new TypeError("fetch failed");
    });
    expect(outcome).toMatchObject({ ok: false, pending: false, error: fallback, status: null });
  });

  it("keeps the button clear on every failure path", async () => {
    const failures = [
      attempt({ size: MAX_UPLOAD_BYTES + 1 }, vi.fn()),
      attempt({ size: 100 }, async () => new Response("nope", { status: 413, headers: { "content-type": "text/html" } })),
      attempt({ size: 100 }, async () => new Response("nope", { status: 500, headers: { "content-type": "text/html" } })),
      attempt({ size: 100 }, async () => { throw new Error("network down"); }),
    ];
    const outcomes = await Promise.all(failures);
    expect(outcomes.map((outcome) => outcome.pending)).toEqual([false, false, false, false]);
    expect(outcomes.every((outcome) => outcome.ok === false && outcome.error.length > 0)).toBe(true);
  });

  it("sends a file at the cap and surfaces a JSON error without staying pending", async () => {
    const send = vi.fn(async () => Response.json(
      { error: { code: "NOT_PDF", message: "Only PDF files are accepted." } },
      { status: 415, headers: { "content-type": "application/json; charset=utf-8" } },
    ));
    const outcome = await attempt({ size: MAX_UPLOAD_BYTES }, send);
    expect(send).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ ok: false, pending: false, error: "Only PDF files are accepted.", status: 415 });
  });

  it("rejects a 20 MB content-length and ignores a missing one", () => {
    expect(uploadBodyTooLarge({ headers: new Headers({ "content-length": "20971520" }) })).toBe(true);
    expect(uploadBodyTooLarge({ headers: new Headers() })).toBe(false);
    expect(uploadBodyTooLarge({ headers: new Headers({ "content-length": "1200" }) })).toBe(false);
  });
});
