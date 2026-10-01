import type { ApprovedChangePreview } from "./exportPacketView";

const PROPOSED_FACT_SUBJECT_PREFIX = "proposed-fact:";

export interface DeskValueInput {
  proposedFactId: string;
  summary: string;
  documentTitle: string;
  revisionLabel: string;
  reviewerId: string;
  evidence: ReadonlyArray<{ pageNumber: number; excerpt: string }>;
}

export interface DeskFactRow {
  key: string;
  title: string;
  meta: string;
  pageNumber: number | null;
  excerpt: string;
}

function citedPage(pageNumber: number | null | undefined) {
  return typeof pageNumber === "number" && Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
}

function leadEvidence(evidence: ReadonlyArray<{ pageNumber: number; excerpt: string }>) {
  const item = evidence.find((entry) => citedPage(entry.pageNumber) !== null) ?? evidence[0];
  if (!item) return { pageNumber: null, excerpt: "" };
  return { pageNumber: citedPage(item.pageNumber), excerpt: item.excerpt.trim() };
}

/** One desk list: current accepted values, plus approved-pack rows that are not already those values. */
export function mergeDeskFacts(values: readonly DeskValueInput[], approved: readonly ApprovedChangePreview[]): DeskFactRow[] {
  const rows: DeskFactRow[] = values.map((value) => {
    const lead = leadEvidence(value.evidence);
    return {
      key: `value:${value.proposedFactId}`,
      title: value.summary,
      meta: `${value.documentTitle} · ${value.revisionLabel} · accepted by ${value.reviewerId}`,
      pageNumber: lead.pageNumber,
      excerpt: lead.excerpt,
    };
  });
  const evidenceKeys = new Set(values.flatMap((value) => value.evidence.map((item) => `${citedPage(item.pageNumber) ?? ""}:${item.excerpt.trim()}`)));
  const titles = new Set(values.map((value) => value.summary.trim()));
  for (const change of approved) {
    if (values.some((value) => `${PROPOSED_FACT_SUBJECT_PREFIX}${value.proposedFactId}` === change.subjectKey)) continue;
    const lead = leadEvidence(change.evidence);
    const evidenceKey = `${lead.pageNumber ?? ""}:${lead.excerpt}`;
    if (lead.pageNumber && evidenceKeys.has(evidenceKey)) continue;
    if (titles.has(change.summary.trim())) continue;
    rows.push({
      key: `pack:${change.subjectKey}`,
      title: change.summary,
      meta: "Approved",
      pageNumber: lead.pageNumber,
      excerpt: lead.excerpt,
    });
  }
  return rows;
}

export function deskFactCite(row: Pick<DeskFactRow, "pageNumber" | "excerpt">) {
  if (!row.pageNumber) return null;
  return { page: row.pageNumber, excerpt: row.excerpt || "No linked excerpt available." };
}

export function defaultDeskKey(
  facts: readonly { key: string; pageNumber: number | null }[],
  findings: readonly { key: string; pageNumber: number | null }[],
) {
  return facts.find((row) => row.pageNumber)?.key
    ?? findings.find((row) => row.pageNumber)?.key
    ?? "";
}
