import type { ProposedFactType, RevisionChangeType } from "@/lib/domain/types";

export const FACT_TYPE_BADGE = {
  equipment_requirement: "EQUIPMENT",
  schedule_date: "SCHEDULE",
  quantity: "QUANTITY",
} as const satisfies Record<ProposedFactType, string>;

export const REVISION_CHANGE_BADGE = {
  ADDED: "ADDED",
  MODIFIED: "MODIFIED",
  REMOVED: "REMOVED",
} as const satisfies Record<RevisionChangeType, string>;

export type DeskBadge = {
  kind: "fact" | "change";
  label: (typeof FACT_TYPE_BADGE)[ProposedFactType] | (typeof REVISION_CHANGE_BADGE)[RevisionChangeType];
};

export function factTypeBadge(factType: ProposedFactType) {
  return FACT_TYPE_BADGE[factType];
}

export function revisionChangeBadge(changeType: RevisionChangeType) {
  return REVISION_CHANGE_BADGE[changeType];
}

export function queueBadges(finding: {
  subject: { type: string; changeType?: string };
  before: { category?: string } | null;
  after: { category?: string } | null;
}): DeskBadge[] {
  const badges: DeskBadge[] = [];
  const category = (finding.after ?? finding.before)?.category;
  if (category && isProposedFactType(category)) badges.push({ kind: "fact", label: factTypeBadge(category) });
  const changeType = finding.subject.type === "revision_change" ? finding.subject.changeType : undefined;
  if (changeType && isRevisionChangeType(changeType)) badges.push({ kind: "change", label: revisionChangeBadge(changeType) });
  return badges;
}

/** Accepted and dismissed facts have been reviewed. Flagged items are still suggestions. */
export function showAiSuggested(decision: { decision: string } | null | undefined) {
  const value = decision?.decision;
  return value !== "ACCEPTED" && value !== "DISMISSED";
}

function isProposedFactType(value: string): value is ProposedFactType {
  return Object.prototype.hasOwnProperty.call(FACT_TYPE_BADGE, value);
}

function isRevisionChangeType(value: string): value is RevisionChangeType {
  return Object.prototype.hasOwnProperty.call(REVISION_CHANGE_BADGE, value);
}
