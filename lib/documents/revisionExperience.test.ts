import { describe, expect, it } from "vitest";
import type { EvidenceLocation } from "@/lib/review/evidenceLocation";
import {
  changeKind,
  changeSummary,
  describeAnalysis,
  describeReading,
  emptyExtractCopy,
  formatBytes,
  revisionSignals,
  type RevisionFindingView,
} from "./revisionExperience";

const evidence: EvidenceLocation = {
  documentPageId: "page_1",
  pageNumber: 2,
  excerpt: "24 IN RCP",
  startOffset: 4,
  endOffset: 13,
  revisionId: "rev_b",
  revisionLabel: "Revision B",
  documentTitle: "Drainage Plan",
};

function finding(overrides: Partial<RevisionFindingView> & Pick<RevisionFindingView, "subject">): RevisionFindingView {
  return {
    label: "Pipe diameter",
    material: null,
    evidence: [evidence],
    sources: [{ revisionId: "rev_b" }],
    ...overrides,
  };
}

describe("describeReading", () => {
  it("explains a scanned file without internal codes", () => {
    const copy = describeReading("FAILED", "SCANNED_OR_EMPTY", "No usable embedded text was found. OCR is not available in Phase 1.", true);
    expect(copy.label).toBe("Failed");
    expect(copy.summary).toMatch(/selectable text/i);
    expect(copy.action).toMatch(/not a scan/i);
    expect(`${copy.label} ${copy.summary} ${copy.action}`).not.toMatch(/SCANNED|OCR|Phase 1|storage|Ready|Latest/i);
  });

  it("uses the register status words for the latest revision", () => {
    expect(describeReading("PROCESSED", null, null, true)).toMatchObject({ label: "Current", tone: "ready", action: null });
    expect(describeReading("PROCESSING", null, null, true)).toMatchObject({ label: "Processing", tone: "waiting" });
    expect(describeReading("PROCESSING", null, null, true).summary).toMatch(/being read/i);
    expect(describeReading("UPLOADED", null, null, true)).toMatchObject({ label: "Processing", tone: "waiting" });
    expect(describeReading("FAILED", null, null, true).label).toBe("Failed");
  });

  it("labels every older revision Superseded", () => {
    expect(describeReading("PROCESSED", null, null, false)).toMatchObject({ label: "Superseded", tone: "idle" });
    expect(describeReading("FAILED", "SCANNED_OR_EMPTY", "No usable embedded text was found.", false).label).toBe("Superseded");
    expect(describeReading("PROCESSING", null, null, false).label).toBe("Superseded");
    expect(describeReading("UPLOADED", null, null, false).label).toBe("Superseded");
  });
});

describe("describeAnalysis", () => {
  it("uses the latest attempt and hides extractor details", () => {
    const copy = describeAnalysis([
      { attemptNumber: 1, status: "FAILED", failureMessage: "Model output failed schema validation." },
      { attemptNumber: 2, status: "SUCCEEDED", failureMessage: null },
    ]);
    expect(copy).toMatchObject({ label: "Analyzed", tone: "ready" });
    expect(JSON.stringify(copy)).not.toMatch(/schema|extractor|model/i);
  });

  it("describes an empty analysis history", () => {
    expect(describeAnalysis([])).toMatchObject({ label: "Not analyzed", tone: "idle" });
  });

  it("does not call a finished run with nothing listed analyzed", () => {
    const copy = describeAnalysis([{ attemptNumber: 1, status: "SUCCEEDED", failureMessage: null }], 0);
    expect(copy).toMatchObject({ label: "No extracts", tone: "idle", summary: "" });
    expect(copy.tone).not.toBe("ready");
  });

  it("keeps analyzed when the run listed facts", () => {
    expect(describeAnalysis([{ attemptNumber: 1, status: "SUCCEEDED", failureMessage: null }], 2)).toMatchObject({
      label: "Analyzed",
      tone: "ready",
    });
  });
});

describe("emptyExtractCopy", () => {
  it("stays honest after the PDF is already read", () => {
    expect(emptyExtractCopy("ready")).toBe("No proposed facts from this revision yet.");
    expect(emptyExtractCopy("ready")).not.toMatch(/nothing to review|after this revision is read/i);
  });

  it("explains a revision that is still being read", () => {
    expect(emptyExtractCopy("waiting")).toMatch(/after this revision is read/i);
    expect(emptyExtractCopy("failed")).toBe("No proposed facts from this revision.");
  });
});

describe("revisionSignals", () => {
  it("counts changes and material findings for the revision they landed on", () => {
    const signals = revisionSignals("rev_b", [
      finding({ material: true, subject: { type: "revision_change", changeType: "MODIFIED", revisedRevisionId: "rev_b" } }),
      finding({ material: false, subject: { type: "revision_change", changeType: "ADDED", revisedRevisionId: "rev_b" } }),
      finding({ material: true, subject: { type: "revision_change", changeType: "REMOVED", revisedRevisionId: "rev_a" } }),
      finding({ subject: { type: "proposed_fact" }, sources: [{ revisionId: "rev_a" }] }),
    ]);
    expect(signals.changeCount).toBe(2);
    expect(signals.materialCount).toBe(1);
    expect(changeSummary(signals)).toBe("2 changes, 1 material");
    expect(changeKind(signals.changes[0]!)).toBe("Material · Changed");
  });

  it("falls back to extracted items when nothing was compared", () => {
    const signals = revisionSignals("rev_a", [
      finding({ subject: { type: "proposed_fact" }, sources: [{ revisionId: "rev_a" }] }),
    ]);
    expect(changeSummary(signals)).toBe("1 extracted item");
    expect(changeKind(signals.extracted[0]!)).toBe("Extracted item");
  });
});

describe("formatBytes", () => {
  it("formats file sizes for people", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
