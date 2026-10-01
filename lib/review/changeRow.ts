type RowFinding = {
  subject: { type: string; changeType?: string };
  before: { category?: string; evidence: { pageNumber: number }[] } | null;
  after: { category?: string; evidence: { pageNumber: number }[] } | null;
  evidence: { pageNumber: number }[];
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
  const page = finding.after?.evidence[0]?.pageNumber
    ?? finding.before?.evidence[0]?.pageNumber
    ?? finding.evidence[0]?.pageNumber;
  return page ? `p. ${page}` : "p. —";
}
