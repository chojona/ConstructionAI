import { signoffForReviewer, type ApprovalSignoff } from "@/lib/auth/approvalSignoff";
import type { ReviewerDirectoryEntry } from "@/lib/auth/roles";
import { citePinStatus, formatCiteLabel, type CitePinStatus } from "./citeLabel";
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

export function changePageCite(finding: RowFinding): { label: string; status: CitePinStatus } {
  const lead = changeEvidenceLead(finding);
  const input = {
    documentTitle: lead?.documentTitle,
    revisionLabel: lead?.revisionLabel,
    revisionId: lead?.revisionId,
    page: lead?.page,
  };
  return { label: formatCiteLabel(input), status: citePinStatus(input) };
}

export function changePageChip(finding: RowFinding) {
  return changePageCite(finding).label;
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
  currentDecision: { decision: string; reviewerId?: string } | null;
}

export interface DecidedRowChrome {
  key: string;
  decision: "ACCEPTED" | "DISMISSED";
  title: string;
  documentTitle: string;
  revisionLabel: string;
  pageLabel: string;
  pinStatus: CitePinStatus;
  pageNumber: number | null;
  excerpt: string;
  revisionId: string | null;
  /** Lead document and revision when the chip is unpinned and the rail still names them. */
  evidenceDocumentTitle?: string | null;
  evidenceRevisionLabel?: string | null;
  sourceCitation?: string | null;
  badges?: readonly DeskBadge[];
  signoff?: ApprovalSignoff | null;
}

/** List and drawer fields open change cards already show: document, revision, and page. */
export function openRowChrome(finding: RowFinding & { documentTitle: string; revisionLabel: string }) {
  const lead = changeEvidenceLead(finding);
  const cite = changePageCite(finding);
  const pageNumber = lead?.page && lead.page > 0 ? lead.page : null;
  return {
    documentTitle: finding.documentTitle,
    revisionLabel: finding.revisionLabel,
    pageLabel: cite.label,
    pinStatus: cite.status,
    pageNumber,
    excerpt: lead?.excerpt ?? "",
    revisionId: lead?.revisionId ?? null,
    evidenceDocumentTitle: lead?.documentTitle ?? null,
    evidenceRevisionLabel: lead?.revisionLabel ?? null,
    sourceCitation: lead ? pinnedSourceCitation({
      documentTitle: lead.documentTitle || finding.documentTitle,
      revisionLabel: lead.revisionLabel,
      revisionId: lead.revisionId,
      pageNumber,
    }) : null,
    badges: queueBadges(finding),
  };
}

export function decidedRowChrome(
  findings: readonly DecidedFinding[],
  directory: readonly ReviewerDirectoryEntry[] = [],
): DecidedRowChrome[] {
  const rows: DecidedRowChrome[] = [];
  for (const finding of findings) {
    const decision = finding.currentDecision?.decision;
    if (decision !== "ACCEPTED" && decision !== "DISMISSED") continue;
    const reviewerId = finding.currentDecision?.reviewerId;
    rows.push({
      key: finding.subjectKey,
      decision,
      title: finding.label,
      ...openRowChrome(finding),
      signoff: decision === "ACCEPTED" && reviewerId ? signoffForReviewer(reviewerId, directory) : null,
    });
  }
  return rows;
}
