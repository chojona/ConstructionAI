import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentsDesk } from "@/components/workspace/documents-desk";
import { emptyRegisterQuery, registerRows, type RegisterDocumentDto, type RegisterRevisionDto } from "./documentRegister";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project_1",
  useRouter: () => ({ push() { return undefined; } }),
}));

function rev(
  id: string,
  revisionLabel: string,
  revisionOrder: number,
  revisionStatus: RegisterRevisionDto["revisionStatus"],
  pageCount: number,
): RegisterRevisionDto {
  return { id, revisionLabel, revisionOrder, revisionStatus, pageCount, updatedLabel: "2 days ago" };
}

function plan(revisions: RegisterRevisionDto[], issuedLabel: string | null = null): RegisterDocumentDto {
  return {
    id: "plan",
    title: "Drainage Plan",
    documentType: "Plan",
    openChangeCount: 1,
    issuedLabel,
    revisions,
  };
}

function renderDesk(document: RegisterDocumentDto, revision: "latest" | "all", revisionId: string | null) {
  return renderToStaticMarkup(createElement(DocumentsDesk, {
    documents: [document],
    query: { ...emptyRegisterQuery(), revision, documentId: document.id, revisionId },
  }));
}

function visibleCopy(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

const processedB = rev("rev-b", "B", 2, "PROCESSED", 9);
const failedC = rev("rev-c", "C", 3, "FAILED", 8);
const processingC = rev("rev-c", "C", 3, "PROCESSING", 8);

describe("documents desk current revision", () => {
  it("selects the newest processed revision when the newest upload failed", () => {
    const document = plan([rev("rev-a", "A", 1, "PROCESSED", 4), processedB, failedC], "Current revision uploaded Oct 2, 2026");
    const filtered = renderDesk(document, "latest", "rev-c");
    const history = renderDesk(document, "all", "rev-b");

    expect(registerRows([document], "latest").map((row) => [row.revisionLabel, row.status])).toEqual([["B", "Current"]]);
    expect(filtered).toContain('<td class="col-rev">B</td>');
    expect(filtered).not.toContain('<td class="col-rev">C</td>');
    expect(filtered).toContain("<dt>Current rev</dt><dd>B</dd>");
    expect(filtered).toContain("<dt>Pages</dt><dd>9</dd>");
    expect(filtered).not.toContain("<dt>Pages</dt><dd>8</dd>");
    expect(filtered).toContain('status-processed">Current<');
    expect(filtered).toContain("Newest upload C");
    expect(filtered).toContain('status-failed">Failed<');
    expect(filtered).toMatch(/<option value="latest"[^>]*>Current<\/option>/);

    expect(history).toContain('<td class="col-rev">B</td>');
    expect(history).toContain('<td class="col-rev">C</td>');
    expect(history).toContain('status-processed">Current<');
    expect(history).toContain('status-failed">Failed<');
    expect(history).toContain('status-muted">Superseded<');
  });

  it("selects the newest processed revision when the newest upload is still processing", () => {
    const document = plan([processedB, processingC], "Current revision uploaded Oct 2, 2026");
    const html = renderDesk(document, "latest", "rev-c");

    expect(registerRows([document], "latest").map((row) => [row.revisionLabel, row.status])).toEqual([["B", "Current"]]);
    expect(html).toContain('<td class="col-rev">B</td>');
    expect(html).not.toContain('<td class="col-rev">C</td>');
    expect(html).toContain("<dt>Current rev</dt><dd>B</dd>");
    expect(html).toContain("Newest upload C");
    expect(html).toContain('status-pending">Processing<');
    expect(html).not.toContain("status-failed");
  });

  it("shows an em dash for pages when the only revision failed", () => {
    const html = renderDesk(plan([rev("rev-c", "C", 1, "FAILED", 8)]), "all", "rev-c");

    expect(html).toContain("No current revision");
    expect(html).toContain("<dt>Pages</dt><dd>—</dd>");
    expect(html).not.toContain("<dt>Pages</dt><dd>8</dd>");
    expect(html).not.toContain("status-processed");
    expect(html).toContain('status-failed">Failed<');
  });

  it("shows no current revision when nothing is processed", () => {
    const document = plan([rev("rev-b", "B", 1, "FAILED", 2), processingC]);
    const html = renderDesk(document, "all", "rev-c");

    expect(registerRows([document], "latest")).toEqual([]);
    expect(html).toContain("No current revision");
    expect(html).toContain("Newest upload C");
    expect(html).toContain('status-pending">Processing<');
    expect(html).toContain('status-failed">Failed<');
    expect(html).toContain("<dt>Pages</dt><dd>—</dd>");
    expect(html).not.toContain("<dt>Pages</dt><dd>2</dd>");
    expect(html).not.toContain("<dt>Pages</dt><dd>8</dd>");
    expect(html).not.toContain("status-processed");
    expect(html).not.toContain("<dt>Current rev</dt>");
    expect(html).not.toContain("Current revision uploaded");
  });

  it("shows the processed revision on the happy path", () => {
    const document = plan([rev("rev-a", "A", 1, "PROCESSED", 4), processedB], "Current revision uploaded Oct 2, 2026");
    const html = renderDesk(document, "latest", "rev-b");

    expect(registerRows([document], "latest").map((row) => [row.revisionLabel, row.status])).toEqual([["B", "Current"]]);
    expect(html).toContain("<dt>Current rev</dt><dd>B</dd>");
    expect(html).toContain("Current revision uploaded Oct 2, 2026");
    expect(html).toContain('status-processed">Current<');
    expect(html).not.toContain("Newest upload");
    expect(html).not.toContain("No current revision");
    expect(html).toContain('<td class="col-rev">B</td>');
  });

  it("does not render issued or Latest copy", () => {
    const pages = [
      renderDesk(plan([processedB, failedC], "Current revision uploaded Oct 2, 2026"), "latest", "rev-b"),
      renderDesk(plan([processedB, processingC], "Current revision uploaded Oct 2, 2026"), "latest", "rev-b"),
      renderDesk(plan([rev("rev-b", "B", 1, "FAILED", 2), processingC]), "all", "rev-c"),
      renderDesk(plan([processedB], "Current revision uploaded Oct 2, 2026"), "latest", "rev-b"),
    ].map(visibleCopy).join("\n");

    expect(pages).not.toMatch(/issued/i);
    expect(pages).not.toMatch(/Latest/);
    expect(pages).toContain("Current revision uploaded Oct 2, 2026");
    expect(pages).toContain("Current rev");
    expect(pages).toContain("Newest upload");
    expect(pages).toContain("No current revision");
  });
});
