import type { DeskBadge } from "@/lib/review/factBadge";
import { AI_SUGGESTED_LABEL } from "@/lib/review/reviewDeskCopy";

export function FactBadges({ badges, suggested = false }: { badges: readonly DeskBadge[]; suggested?: boolean }) {
  if (!badges.length && !suggested) return null;
  return (
    <span className="fact-badges">
      {badges.map((badge) => (
        <span className={`status-label ${badge.kind === "change" ? "change-type-badge" : "fact-type-badge"}`} key={`${badge.kind}-${badge.label}`}>{badge.label}</span>
      ))}
      {suggested ? <span className="status-label ai-suggested-badge">{AI_SUGGESTED_LABEL}</span> : null}
    </span>
  );
}
