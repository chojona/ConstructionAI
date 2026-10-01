type RowEvidence = { pageNumber: number; excerpt?: string };

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
  };
}
