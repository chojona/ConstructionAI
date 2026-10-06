import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevisionHistory } from "@/components/documents/revision-history";
import { RevisionInspection } from "@/components/documents/revision-inspection";
import type { RevisionRecord } from "@/lib/domain/types";

function revision(overrides: Partial<RevisionRecord> & Pick<RevisionRecord, "id" | "revisionLabel" | "revisionOrder" | "status">): RevisionRecord {
  return {
    documentId: "document_1",
    originalFilename: `${overrides.revisionLabel}.pdf`,
    mimeType: "application/pdf",
    byteSize: 1200,
    sha256: "abc",
    storageKey: "key",
    failureCode: null,
    failureMessage: null,
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
    ...overrides,
  };
}

const older = revision({
  id: "rev_a",
  revisionLabel: "Rev A",
  revisionOrder: 1,
  status: "PROCESSED",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
});
const newer = revision({
  id: "rev_b",
  revisionLabel: "Rev B",
  revisionOrder: 2,
  status: "FAILED",
  failureCode: "SCANNED_OR_EMPTY",
  failureMessage: "No usable embedded text was found. OCR is not available in Phase 1.",
  originalFilename: "rev-b.pdf",
});

const statusWords = ["Current", "Processing", "Failed", "Superseded"] as const;

function statusLabels(html: string): string[] {
  return [...html.matchAll(/status-label [^"]*">([^<]+)</g)].map((match) => match[1] ?? "");
}

describe("revision status on document pages", () => {
  it("labels an older processed revision Superseded and mutes the row", () => {
    const html = renderToStaticMarkup(createElement(RevisionHistory, { revisions: [newer, older], findings: [] }));
    expect(html).toContain("Rev A");
    expect(html).toContain("is-superseded");
    expect(html).toContain("status-muted");
    expect(html).toContain(">Superseded<");
    expect(html).toContain("Upload 1 of 2");
    expect(html).toContain("Upload 2 of 2");
    expect(html).toContain("selectable text");
    expect(html).not.toContain("Latest");
    expect(html).not.toContain("Ready");
    expect(html).not.toContain("Revision 1");
    expect(html).not.toContain("Revision 2");
    const labels = statusLabels(html);
    expect(labels).toEqual(["Failed", "Superseded"]);
    for (const label of labels) expect(statusWords).toContain(label);
  });

  it("labels the newest processed revision Current", () => {
    const current = revision({ id: "rev_b", revisionLabel: "Rev B", revisionOrder: 2, status: "PROCESSED" });
    const html = renderToStaticMarkup(createElement(RevisionHistory, { revisions: [current, older], findings: [] }));
    expect(statusLabels(html)).toEqual(["Current", "Superseded"]);
    expect(html).toContain("status-processed");
    expect(html).not.toContain("latest-mark");
    expect(html).not.toContain(">Ready<");
  });
});

describe("revision status on the revision page", () => {
  it("shows Superseded for an older cite and Upload order instead of Revision N", () => {
    const html = renderToStaticMarkup(createElement(RevisionInspection, {
      revision: { ...older, pageCount: 4 },
      siblings: [older, newer],
      runs: [],
      findings: [],
      uploadedLabel: "Sep 1, 2026",
      returnTo: null,
    }));
    expect(html).toContain("Upload 1 of 2");
    expect(html).toContain(">Superseded<");
    expect(html).toContain("is-superseded");
    expect(html).toContain("status-muted");
    expect(html).not.toContain("Revision 1");
    expect(html).not.toContain("Ready");
    expect(html).not.toContain("Latest");
    expect(statusLabels(html).filter((label) => statusWords.includes(label as typeof statusWords[number]))).toContain("Superseded");
  });

  it("shows Current for the latest processed revision", () => {
    const current = revision({ id: "rev_b", revisionLabel: "Rev B", revisionOrder: 2, status: "PROCESSED" });
    const html = renderToStaticMarkup(createElement(RevisionInspection, {
      revision: { ...current, pageCount: 2 },
      siblings: [older, current],
      runs: [{ attemptNumber: 1, status: "SUCCEEDED", failureMessage: null }],
      findings: [],
      uploadedLabel: "Oct 2, 2026",
      returnTo: null,
    }));
    expect(html).toContain("Upload 2 of 2");
    expect(html).toContain(">Current<");
    expect(html).not.toContain(">Ready<");
    expect(html).not.toContain("Latest");
    expect(html).not.toContain("Revision 2");
  });

  it("keeps the failure note under Failed", () => {
    const html = renderToStaticMarkup(createElement(RevisionInspection, {
      revision: { ...newer, pageCount: 1 },
      siblings: [older, newer],
      runs: [],
      findings: [],
      uploadedLabel: "Oct 2, 2026",
      returnTo: null,
    }));
    expect(html).toContain(">Failed<");
    expect(html).toContain("selectable text");
    expect(html).toContain("not a scan");
    expect(html).not.toContain("Needs a new file");
    expect(html).not.toContain("Ready");
  });
});
