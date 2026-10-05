import { queueBadges, type DeskBadge } from "./factBadge";
import { pinnedSourceCitation } from "./sourceCitation";

type RowEvidence = {
  pageNumber: number;
  excerpt?: string;
  revisionId?: string;
  revisionLabel?: string;
  documentTitle?: string;
};

type RowFinding = {
  subject: { type: string; changeType?: string };
  before: { category?: string; evidence: RowEvidence[] } | null;
  after: { category?: string; evidence: RowEvidence[] } | null;
  evidence: RowEvidence[];
};

export function changeRowTitle(finding: RowFinding) {
  const category = (finding.after ?? finding.before)?.category;
  const label = category === "equipment_requirement" ? "Equipment requirement"
    : category === "schedule_date" ? "Schedule date"
      : category === "quantity" ? "Quantity"
        : "Item";
  if (finding.subject.type === "proposed_fact") return `${label} to review`;
  const changeType = finding.subject.changeType;
  return `${label} ${changeType === "ADDED" ? "added" : changeType === "REMOVED" ? "removed" : "changed"}`;
}

export function changePageChip(finding: RowFinding) {
  const page = changeEvidenceLead(finding)?.page;
  return page ? `p. ${page}` : "p. —";
}

export function changeEvidenceLead(finding: RowFinding) {
  const evidence = finding.after?.evidence[0]
    ?? finding.before?.evidence[0]
    ?? finding.evidence[0];
  if (!evidence) return null;
  const excerpt = evidence.excerpt?.trim();
  return {
    page: evidence.pageNumber,
    excerpt: excerpt || "No linked excerpt available.",
    revisionId: evidence.revisionId?.trim() || null,
    revisionLabel: evidence.revisionLabel?.trim() || null,
    documentTitle: evidence.documentTitle?.trim() || null,
  };
}

export interface DecidedFinding extends RowFinding {
  subjectKey: string;
  documentTitle: string;
  revisionLabel: string;
  label: string;
  currentDecision: { decision: string } | null;
}

export interface DecidedRowChrome {
  key: string;
  decision: "ACCEPTED" | "DISMISSED";
  title: string;
  documentTitle: string;
  revisionLabel: string;
  pageLabel: string;
  pageNumber: number | null;
  excerpt: string;
  revisionId: string | null;
  sourceCitation?: string | null;
  badges?: readonly DeskBadge[];
}

/** List and drawer fields open change cards already show: document, revision, and page. */
export function openRowChrome(finding: RowFinding & { documentTitle: string; revisionLabel: string }) {
  const lead = changeEvidenceLead(finding);
  const pageNumber = lead?.page && lead.page > 0 ? lead.page : null;
  return {
    documentTitle: finding.documentTitle,
    revisionLabel: finding.revisionLabel,
    pageLabel: changePageChip(finding),
    pageNumber,
    excerpt: lead?.excerpt ?? "",
    revisionId: lead?.revisionId ?? null,
    sourceCitation: lead ? pinnedSourceCitation({
      documentTitle: lead.documentTitle || finding.documentTitle,
      revisionLabel: lead.revisionLabel,
      revisionId: lead.revisionId,
      pageNumber,
    }) : null,
    badges: queueBadges(finding),
  };
}

export function decidedRowChrome(findings: readonly DecidedFinding[]): DecidedRowChrome[] {
  const rows: DecidedRowChrome[] = [];
  for (const finding of findings) {
    const decision = finding.currentDecision?.decision;
    if (decision !== "ACCEPTED" && decision !== "DISMISSED") continue;
    rows.push({
      key: finding.subjectKey,
      decision,
      title: finding.label,
      ...openRowChrome(finding),
    });
  }
  return rows;
}
