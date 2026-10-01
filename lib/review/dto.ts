import type { ReviewDecisionRecord } from "@/lib/domain/types";
import type { AttentionItem } from "./attention";
import type { ProjectFinding } from "./findings";
import type { EffectiveProjectState } from "./projectState";

export function toReviewDecisionDto(decision: ReviewDecisionRecord) {
  return { ...decision, createdAt: decision.createdAt.toISOString() };
}

export function toProjectStateDto(state: EffectiveProjectState) {
  return {
    facts: state.facts.map((fact) => ({ ...fact, acceptedAt: fact.acceptedAt.toISOString() })),
    retirements: state.retirements.map((retirement) => ({ ...retirement, retiredAt: retirement.retiredAt.toISOString() })),
  };
}

export function toFindingDto(finding: ProjectFinding) {
  return {
    ...finding,
    currentDecision: finding.currentDecision ? toReviewDecisionDto(finding.currentDecision) : null,
  };
}

export function toAttentionDto(item: AttentionItem) {
  return { ...item, finding: toFindingDto(item.finding) };
}

export type FindingDto = ReturnType<typeof toFindingDto>;
export type AttentionItemDto = ReturnType<typeof toAttentionDto>;
export type ProjectStateDto = ReturnType<typeof toProjectStateDto>;
