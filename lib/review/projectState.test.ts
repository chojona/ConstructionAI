import { describe, expect, it } from "vitest";
import type { ProjectFactContext, ProjectRevisionContext, ReviewDecisionRecord } from "@/lib/domain/types";
import { projectEffectiveState } from "./projectState";
import { proposedFactSubjectKey, removalSubjectKey } from "./subjects";

const statement = "A CAT 336 excavator shall be used.";

describe("projectEffectiveState", () => {
  it("keeps only accepted facts and records who accepted them", () => {
    const revision = rev("rev-a", "doc-1", 1);
    const fact = equipment("fact-a", "rev-a", "CAT 336", statement);
    const state = projectEffectiveState({
      projectId: "project-1",
      revisions: [revision],
      facts: [fact, equipment("fact-b", "rev-a", "dozer", "A dozer may be required.")],
      decisions: [
        decision("decision-accept", "fact-a", "ACCEPTED", "2026-09-30T12:00:00.000Z"),
        decision("decision-flag", "fact-b", "FLAGGED", "2026-09-30T12:01:00.000Z", "Needs the superintendent."),
      ],
    });

    expect(state.facts).toEqual([
      expect.objectContaining({
        proposedFactId: "fact-a",
        summary: `CAT 336: ${statement}`,
        reviewerId: "pm-1",
        reason: "Matches the drawing note.",
        supersedesProposedFactId: null,
        evidence: [expect.objectContaining({ excerpt: statement, pageNumber: 1 })],
      }),
    ]);
    expect(state.retirements).toEqual([]);
  });

  it("lets a later accepted fact supersede an earlier one without dropping either decision", () => {
    const earlier = equipment("fact-a", "rev-a", "CAT 320", "Use a CAT 320.");
    const later = equipment("fact-b", "rev-b", "CAT 320", "Use a CAT 336.");
    later.payload.equipment = "CAT 320";
    later.payload.statement = "Use a CAT 336.";
    const state = projectEffectiveState({
      projectId: "project-1",
      revisions: [rev("rev-a", "doc-1", 1), rev("rev-b", "doc-1", 2)],
      facts: [earlier, later],
      decisions: [
        decision("decision-a", "fact-a", "ACCEPTED", "2026-09-30T12:00:00.000Z"),
        decision("decision-b", "fact-b", "ACCEPTED", "2026-09-30T13:00:00.000Z"),
      ],
    });

    expect(state.facts.map((fact) => fact.proposedFactId)).toEqual(["fact-b"]);
    expect(state.facts[0]).toMatchObject({ supersedesProposedFactId: "fact-a", reviewerId: "pm-1" });
    expect(state.retirements).toEqual([
      expect.objectContaining({
        proposedFactId: "fact-a",
        documentId: "doc-1",
        supersededByProposedFactId: "fact-b",
        decisionId: "decision-b",
      }),
    ]);
  });

  it("restores the earlier fact when a later acceptance is dismissed", () => {
    const state = projectEffectiveState({
      projectId: "project-1",
      revisions: [rev("rev-a", "doc-1", 1), rev("rev-b", "doc-1", 2)],
      facts: [
        equipment("fact-a", "rev-a", "CAT 320", "Use a CAT 320."),
        equipment("fact-b", "rev-b", "CAT 320", "Use a CAT 336."),
      ],
      decisions: [
        decision("decision-a", "fact-a", "ACCEPTED", "2026-09-30T12:00:00.000Z"),
        decision("decision-b", "fact-b", "DISMISSED", "2026-09-30T13:00:00.000Z", "Wrong machine."),
      ],
    });

    expect(state.facts.map((fact) => fact.proposedFactId)).toEqual(["fact-a"]);
    expect(state.retirements).toEqual([]);
  });

  it("retires an accepted fact when the removal finding is accepted", () => {
    const before = equipment("fact-a", "rev-a", "CAT 336", statement);
    const removal = decision("decision-removal", "fact-a", "ACCEPTED", "2026-09-30T13:00:00.000Z");
    removal.subjectKind = "REVISION_CHANGE";
    removal.changeType = "REMOVED";
    removal.subjectKey = removalSubjectKey({
      baseRevisionId: "rev-a",
      revisedRevisionId: "rev-b",
      before: { id: before.id, factType: before.factType, payload: before.payload, evidence: before.evidence },
    });
    removal.beforeProposedFactId = before.id;
    removal.baseRevisionId = "rev-a";
    removal.revisedRevisionId = "rev-b";

    const state = projectEffectiveState({
      projectId: "project-1",
      revisions: [rev("rev-a", "doc-1", 1), rev("rev-b", "doc-1", 2, "B")],
      facts: [before],
      decisions: [decision("decision-a", "fact-a", "ACCEPTED", "2026-09-30T12:00:00.000Z"), removal],
    });

    expect(state.facts).toEqual([]);
    expect(state.retirements).toEqual([
      expect.objectContaining({ proposedFactId: "fact-a", supersededByProposedFactId: null, decisionId: "decision-removal" }),
    ]);
  });

  it("does not merge the same equipment across documents", () => {
    const state = projectEffectiveState({
      projectId: "project-1",
      revisions: [rev("rev-a", "doc-1", 1), rev("rev-c", "doc-2", 1, "A", "Paving")],
      facts: [
        equipment("fact-a", "rev-a", "CAT 336", statement),
        equipment("fact-c", "rev-c", "CAT 336", statement),
      ],
      decisions: [
        decision("decision-a", "fact-a", "ACCEPTED", "2026-09-30T12:00:00.000Z"),
        decision("decision-c", "fact-c", "ACCEPTED", "2026-09-30T12:05:00.000Z"),
      ],
    });

    expect(state.facts.map((fact) => fact.proposedFactId).sort()).toEqual(["fact-a", "fact-c"]);
    expect(state.retirements).toEqual([]);
  });
});

function rev(id: string, documentId: string, revisionOrder: number, revisionLabel = "A", documentTitle = "Drainage"): ProjectRevisionContext {
  return { id, documentId, documentTitle, revisionLabel, revisionOrder };
}

function equipment(id: string, revisionId: string, name: string, text: string): ProjectFactContext {
  return {
    id,
    extractionRunId: "run",
    documentRevisionId: revisionId,
    ordinal: 0,
    factType: "equipment_requirement",
    payload: { equipment: name, statement: text, modality: "asserted" },
    evidence: [{ documentPageId: "page", pageNumber: 1, excerpt: text, startOffset: 0, endOffset: text.length }],
    createdAt: new Date("2026-09-30T00:00:00.000Z"),
  };
}

function decision(
  id: string,
  proposedFactId: string,
  value: ReviewDecisionRecord["decision"],
  createdAt: string,
  reason = "Matches the drawing note.",
): ReviewDecisionRecord {
  return {
    id,
    projectId: "project-1",
    subjectKind: "PROPOSED_FACT",
    subjectKey: proposedFactSubjectKey(proposedFactId),
    decision: value,
    reviewerId: "pm-1",
    reason,
    proposedFactId,
    beforeProposedFactId: null,
    afterProposedFactId: null,
    baseRevisionId: null,
    revisedRevisionId: null,
    changeType: null,
    supersedesDecisionId: null,
    createdAt: new Date(createdAt),
  };
}
