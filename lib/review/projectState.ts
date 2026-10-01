import type { ProjectFactContext, ProjectRevisionContext, ReviewDecisionRecord } from "@/lib/domain/types";
import { factSlotKey, requirementFingerprint, toComparableFact } from "@/lib/revisions/compareFacts";
import { describeFact } from "./describe";
import { proposedFactSubjectKey } from "./subjects";

export interface EffectiveFact {
  proposedFactId: string;
  documentId: string;
  documentTitle: string;
  documentRevisionId: string;
  revisionLabel: string;
  revisionOrder: number;
  factType: ProjectFactContext["factType"];
  summary: string;
  payload: Record<string, string | null>;
  evidence: ProjectFactContext["evidence"];
  supersedesProposedFactId: string | null;
  decisionId: string;
  reviewerId: string;
  reason: string | null;
  acceptedAt: Date;
}

export interface FactRetirement {
  proposedFactId: string;
  documentId: string;
  summary: string;
  supersededByProposedFactId: string | null;
  decisionId: string;
  reviewerId: string;
  reason: string | null;
  retiredAt: Date;
}

export interface EffectiveProjectState {
  facts: EffectiveFact[];
  retirements: FactRetirement[];
}

interface Slot {
  fact: ProjectFactContext;
  supersedesProposedFactId: string | null;
  decision: ReviewDecisionRecord;
  fingerprint: string;
  slotKey: string;
}

export function projectEffectiveState(input: {
  projectId: string;
  revisions: readonly ProjectRevisionContext[];
  facts: readonly ProjectFactContext[];
  decisions: readonly ReviewDecisionRecord[];
}): EffectiveProjectState {
  const latest = latestBySubject(input.decisions);
  const revisionsById = new Map(input.revisions.map((revision) => [revision.id, revision]));
  const accepted = input.facts.filter((fact) => {
    const decision = latest.get(subjectMapKey(input.projectId, proposedFactSubjectKey(fact.id)));
    return decision?.subjectKind === "PROPOSED_FACT" && decision.decision === "ACCEPTED";
  });
  const retirements: FactRetirement[] = [];
  const facts: EffectiveFact[] = [];

  for (const revisions of revisionsByDocument(input.revisions)) {
    const slots: Slot[] = [];
    for (const revision of revisions) {
      for (const removal of acceptedRemovals(latest, input.projectId, revision.id)) {
        const index = slots.findIndex((slot) => slot.fact.id === removal.proposedFactId);
        if (index < 0) continue;
        const slot = slots[index]!;
        retire(retirements, slot.fact, revision.documentId, null, removal);
        slots.splice(index, 1);
      }

      const incoming = accepted
        .filter((item) => item.documentRevisionId === revision.id)
        .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
      const grouped = new Map<string, ProjectFactContext[]>();
      for (const fact of incoming) {
        const print = requirementFingerprint(toComparableFact(fact));
        grouped.set(print, [...(grouped.get(print) ?? []), fact]);
      }
      const distinct: ProjectFactContext[] = [];
      for (const candidates of grouped.values()) {
        const ordered = [...candidates].sort((left, right) => compareDecisions(
          decisionFor(latest, input.projectId, left.id),
          decisionFor(latest, input.projectId, right.id),
        ));
        const winner = ordered[ordered.length - 1]!;
        const winningDecision = decisionFor(latest, input.projectId, winner.id);
        for (const loser of ordered) {
          if (loser.id !== winner.id) retire(retirements, loser, revision.documentId, winner.id, winningDecision);
        }
        distinct.push(winner);
      }

      const claimed = new Set<number>();
      const placed = new Set<string>();
      const place = (fact: ProjectFactContext, match: (slot: Slot) => boolean) => {
        const index = slots.findIndex((slot, slotIndex) => !claimed.has(slotIndex) && match(slot));
        if (index < 0) return;
        claimed.add(index);
        placed.add(fact.id);
        const previous = slots[index]!;
        const decision = decisionFor(latest, input.projectId, fact.id);
        if (previous.fact.id !== fact.id) {
          retire(retirements, previous.fact, revision.documentId, fact.id, decision);
        }
        slots[index] = {
          fact,
          decision,
          fingerprint: requirementFingerprint(toComparableFact(fact)),
          slotKey: factSlotKey(toComparableFact(fact)),
          supersedesProposedFactId: previous.fact.id !== fact.id
            ? previous.fact.id
            : previous.supersedesProposedFactId,
        };
      };
      for (const fact of distinct) {
        const print = requirementFingerprint(toComparableFact(fact));
        place(fact, (slot) => slot.fingerprint === print);
      }
      for (const fact of distinct) {
        if (placed.has(fact.id)) continue;
        const key = factSlotKey(toComparableFact(fact));
        place(fact, (slot) => slot.slotKey === key);
      }
      for (const fact of distinct) {
        if (placed.has(fact.id)) continue;
        slots.push({
          fact,
          decision: decisionFor(latest, input.projectId, fact.id),
          fingerprint: requirementFingerprint(toComparableFact(fact)),
          slotKey: factSlotKey(toComparableFact(fact)),
          supersedesProposedFactId: null,
        });
      }
    }

    for (const slot of slots) {
      const revision = revisionsById.get(slot.fact.documentRevisionId);
      if (!revision) continue;
      facts.push({
        proposedFactId: slot.fact.id,
        documentId: revision.documentId,
        documentTitle: revision.documentTitle,
        documentRevisionId: revision.id,
        revisionLabel: revision.revisionLabel,
        revisionOrder: revision.revisionOrder,
        factType: slot.fact.factType,
        summary: describeFact(slot.fact),
        payload: { ...slot.fact.payload },
        evidence: slot.fact.evidence.map((item) => ({ ...item })),
        supersedesProposedFactId: slot.supersedesProposedFactId,
        decisionId: slot.decision.id,
        reviewerId: slot.decision.reviewerId,
        reason: slot.decision.reason,
        acceptedAt: slot.decision.createdAt,
      });
    }
  }

  facts.sort((left, right) => (
    left.documentTitle.localeCompare(right.documentTitle)
    || left.revisionOrder - right.revisionOrder
    || left.factType.localeCompare(right.factType)
    || left.proposedFactId.localeCompare(right.proposedFactId)
  ));
  retirements.sort((left, right) => left.retiredAt.getTime() - right.retiredAt.getTime() || left.decisionId.localeCompare(right.decisionId));
  return { facts, retirements };
}

function revisionsByDocument(revisions: readonly ProjectRevisionContext[]) {
  const grouped = new Map<string, ProjectRevisionContext[]>();
  for (const revision of revisions) grouped.set(revision.documentId, [...(grouped.get(revision.documentId) ?? []), revision]);
  return [...grouped.values()].map((items) => (
    [...items].sort((left, right) => left.revisionOrder - right.revisionOrder || left.id.localeCompare(right.id))
  ));
}

function acceptedRemovals(latest: Map<string, ReviewDecisionRecord>, projectId: string, revisedRevisionId: string) {
  return [...latest.values()].filter((decision) => (
    decision.projectId === projectId
    && decision.subjectKind === "REVISION_CHANGE"
    && decision.changeType === "REMOVED"
    && decision.decision === "ACCEPTED"
    && decision.revisedRevisionId === revisedRevisionId
  ));
}

function decisionFor(latest: Map<string, ReviewDecisionRecord>, projectId: string, proposedFactId: string) {
  const decision = latest.get(subjectMapKey(projectId, proposedFactSubjectKey(proposedFactId)));
  if (!decision) throw new Error("Accepted fact is missing its review decision.");
  return decision;
}

function compareDecisions(left: ReviewDecisionRecord, right: ReviewDecisionRecord) {
  return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
}

function latestBySubject(decisions: readonly ReviewDecisionRecord[]) {
  const latest = new Map<string, ReviewDecisionRecord>();
  const ordered = [...decisions].sort(compareDecisions);
  for (const decision of ordered) latest.set(subjectMapKey(decision.projectId, decision.subjectKey), decision);
  return latest;
}

function subjectMapKey(projectId: string, subjectKey: string) {
  return `${projectId}\u0000${subjectKey}`;
}

function retire(
  retirements: FactRetirement[],
  fact: ProjectFactContext,
  documentId: string,
  supersededByProposedFactId: string | null,
  decision: ReviewDecisionRecord,
) {
  if (retirements.some((item) => item.proposedFactId === fact.id && item.decisionId === decision.id)) return;
  retirements.push({
    proposedFactId: fact.id,
    documentId,
    summary: describeFact(fact),
    supersededByProposedFactId,
    decisionId: decision.id,
    reviewerId: decision.reviewerId,
    reason: decision.reason,
    retiredAt: decision.createdAt,
  });
}
