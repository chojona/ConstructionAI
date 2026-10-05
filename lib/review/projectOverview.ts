import type { ReviewDecisionValue } from "@/lib/domain/types";
import type { AttentionSeverity } from "./attention";
import { decisionReturnPath } from "./evidenceLocation";
import { EXPORT_BLOCKED_MESSAGE, exportPacketAction } from "./exportPacketView";

export const NOTHING_AUTO_APPROVED = "Nothing is auto-approved";
export const REVIEW_QUEUE_LABEL = "Review queue →";

const severityRank: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface OverviewAttentionItem {
  severity: AttentionSeverity;
  summary: string;
  subjectKey: string;
}

export interface ProjectOverviewInput {
  projectId: string;
  /** `listAttention` order. The first item of the highest severity is the banner. */
  attention: readonly OverviewAttentionItem[];
  /** Ledger rows, including decisions a later review superseded. */
  decisions: readonly { decision: ReviewDecisionValue }[];
  documentCount: number;
  revisionCreatedAt: readonly Date[];
  approvedCount: number;
  now: Date;
  projectUpdatedAt: Date;
}

export interface DecisionBannerModel {
  title: string;
  summary: string;
  actionLabel: typeof REVIEW_QUEUE_LABEL;
  href: string;
}

export type OverviewStatKey = "attention" | "export" | "documents" | "decisions";
export type OverviewDot = "attention" | "ready" | "blocked" | "neutral";
export type OverviewNoteTone = "attention" | "success";

export interface OverviewStat {
  key: OverviewStatKey;
  label: string;
  value: number;
  helper: string;
  dot: OverviewDot;
  noteTone?: OverviewNoteTone;
}

export interface ProjectOverviewModel {
  banner: DecisionBannerModel | null;
  stats: readonly [OverviewStat, OverviewStat, OverviewStat, OverviewStat];
  /** Shown when the export card helper is a blocked reason, so the line stays on screen. */
  evidenceNote: typeof NOTHING_AUTO_APPROVED | null;
  updatedLabel: string;
}

export function projectOverviewModel(input: ProjectOverviewInput): ProjectOverviewModel {
  const openCount = input.attention.length;
  const top = topAttention(input.attention);
  const high = input.attention.filter((item) => item.severity === "high").length;
  const critical = input.attention.filter((item) => item.severity === "critical").length;
  const exportAction = exportPacketAction(input.approvedCount, input.projectId, openCount);
  const exportReady = exportAction.enabled;
  const decisions = decisionCounts(input.decisions);
  const revisionsThisMonth = countRevisionsThisUtcMonth(input.revisionCreatedAt, input.now);

  const attention: OverviewStat = {
    key: "attention",
    label: "Needs attention",
    value: openCount,
    helper: highSeverityHelper(critical, high),
    dot: openCount > 0 ? "attention" : "neutral",
    noteTone: critical + high > 0 ? "attention" : undefined,
  };
  const exportStat: OverviewStat = {
    key: "export",
    label: exportReady ? "Approved, ready to export" : "Export blocked",
    value: input.approvedCount,
    helper: exportReady ? NOTHING_AUTO_APPROVED : (exportAction.message ?? EXPORT_BLOCKED_MESSAGE),
    dot: exportReady ? "ready" : "blocked",
    noteTone: exportReady ? "success" : "attention",
  };
  const documents: OverviewStat = {
    key: "documents",
    label: "Documents",
    value: input.documentCount,
    helper: revisionsHelper(revisionsThisMonth),
    dot: "neutral",
  };
  const recorded: OverviewStat = {
    key: "decisions",
    label: "Decisions recorded",
    value: decisions.accepted + decisions.dismissed + decisions.flagged,
    helper: `${decisions.accepted} accepted · ${decisions.dismissed} dismissed · ${decisions.flagged} flagged`,
    dot: "neutral",
  };

  return {
    banner: top ? {
      title: openCount === 1 ? "1 change needs a decision" : `${openCount} changes need a decision`,
      summary: oneLine(top.summary),
      actionLabel: REVIEW_QUEUE_LABEL,
      href: decisionReturnPath(input.projectId, top.subjectKey),
    } : null,
    stats: [attention, exportStat, documents, recorded],
    evidenceNote: exportReady ? null : NOTHING_AUTO_APPROVED,
    updatedLabel: updatedLabel(input.projectUpdatedAt, input.now),
  };
}

function topAttention(items: readonly OverviewAttentionItem[]) {
  let best: OverviewAttentionItem | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const rank = severityRank[item.severity];
    if (rank < bestRank) {
      best = item;
      bestRank = rank;
    }
  }
  return best;
}

function highSeverityHelper(critical: number, high: number) {
  if (critical === 0) return `${high} high severity`;
  if (high === 0) return `${critical} critical`;
  return `${critical} critical, ${high} high severity`;
}

function revisionsHelper(count: number) {
  return count === 1 ? "1 revision added this month" : `${count} revisions added this month`;
}

function decisionCounts(decisions: readonly { decision: ReviewDecisionValue }[]) {
  const counts = { accepted: 0, dismissed: 0, flagged: 0 };
  for (const decision of decisions) {
    if (decision.decision === "ACCEPTED") counts.accepted += 1;
    else if (decision.decision === "DISMISSED") counts.dismissed += 1;
    else counts.flagged += 1;
  }
  return counts;
}

/** Calendar month in UTC. The app has no project timezone. */
export function countRevisionsThisUtcMonth(dates: readonly Date[], now: Date) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return dates.filter((date) => {
    const time = date.getTime();
    return !Number.isNaN(time) && time >= start && time < end;
  }).length;
}

export function updatedLabel(updatedAt: Date, now: Date) {
  const elapsed = Math.max(0, now.getTime() - updatedAt.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} ${days === 1 ? "day" : "days"} ago`;
}

function oneLine(value: string) {
  const line = value.replace(/\s+/g, " ").trim();
  return line || "Open change";
}
