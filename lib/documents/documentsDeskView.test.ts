import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentsDesk } from "@/components/workspace/documents-desk";
import { emptyRegisterQuery, type RegisterDocumentDto } from "./documentRegister";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project_1",
  useRouter: () => ({ push() { return undefined; } }),
}));

const document: RegisterDocumentDto = {
  id: "plan",
  title: "Drainage Plan",
  documentType: "Plan",
  openChangeCount: 1,
  issuedLabel: "Current revision issued Oct 2, 2026",
  revisions: [{
    id: "rev-b",
    revisionLabel: "B",
    revisionOrder: 2,
    revisionStatus: "PROCESSED",
    pageCount: 9,
    updatedLabel: "2 days ago",
  }],
};

describe("documents desk copy", () => {
  it("labels the revision filter and selected rail Current while keeping the latest query value", () => {
    const html = renderToStaticMarkup(createElement(DocumentsDesk, {
      documents: [document],
      query: { ...emptyRegisterQuery(), documentId: "plan", revisionId: "rev-b" },
    }));
    expect(html).toMatch(/<option value="latest"[^>]*>Current<\/option>/);
    expect(html).toContain("<dt>Current rev</dt>");
    expect(html).toContain("Current revision issued Oct 2, 2026");
    expect(html).not.toContain(">Latest<");
    expect(html).not.toContain("Latest rev");
    expect(html).not.toContain("Latest revision issued");
  });
});
