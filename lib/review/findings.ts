import type { ProjectFactContext, ProjectReviewSource, ReviewDecisionRecord, RevisionChangeType } from "@/lib/domain/types";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { compareFacts, toComparableFact, type RevisionFactChange } from "@/lib/revisions/compareFacts";
import { describeFact } from "./describe";
import { proposedFactSubjectKey, removalSubjectKey } from "./subjects";

export interface FindingSubjectProposedFact {
  type: "proposed_fact";
  proposedFactId: string;
}

export interface FindingSubjectRevisionChange {
  type: "revision_change";
  baseRevisionId: string;
  revisedRevisionId: string;
  changeType: RevisionChangeType;
  beforeProposedFactId: string | null;
  afterProposedFactId: string | null;
}

export type FindingSubject = FindingSubjectProposedFact | FindingSubjectRevisionChange;

export interface ProjectFinding {
  subjectKey: string;
  documentTitle: string;
  revisionLabel: string;
  label: string;
  detail: string;
  evidence: Array<{ pageNumber: number; excerpt: string }>;
  currentDecision: ReviewDecisionRecord | null;
  subject: FindingSubject;
}

export function listProjectFindings(
  source: ProjectReviewSource,
  decisions: readonly ReviewDecisionRecord[],
): ProjectFinding[] {
  const latest = latestBySubject(decisions);
  const findings: ProjectFinding[] = [];
  const revisionsByDocument = new Map<string, typeof source.revisions>();
  for (const revision of source.revisions) {
    revisionsByDocument.set(revision.documentId, [...(revisionsByDocument.get(revision.documentId) ?? []), revision]);
  }

  for (const revisions of revisionsByDocument.values()) {
    const comparable = revisions
      .filter((revision) => latestSucceededRun(source, revision.id))
      .sort((left, right) => left.revisionOrder - right.revisionOrder || left.id.localeCompare(right.id));
    const first = comparable[0];
    if (first) {
      for (const fact of storedFacts(source, first.id)) findings.push(factFinding(source.projectId, first, fact, latest));
    }
    for (let index = 1; index < comparable.length; index += 1) {
      const base = comparable[index - 1]!;
      const revised = comparable[index]!;
      for (const change of compareFacts(factsFor(source, base.id), factsFor(source, revised.id))) {
        findings.push(changeFinding(source.projectId, base, revised, change, latest));
      }
    }
  }

  return findings.sort((left, right) => (
    left.documentTitle.localeCompare(right.documentTitle)
    || left.revisionLabel.localeCompare(right.revisionLabel)
    || left.label.localeCompare(right.label)
    || left.subjectKey.localeCompare(right.subjectKey)
  ));
}

function changeFinding(
  projectId: string,
  base: ProjectReviewSource["revisions"][number],
  revised: ProjectReviewSource["revisions"][number],
  change: RevisionFactChange,
  latest: Map<string, ReviewDecisionRecord>,
): ProjectFinding {
  const focus = change.after ?? change.before;
  const subject: FindingSubjectRevisionChange = {
    type: "revision_change",
    baseRevisionId: base.id,
    revisedRevisionId: revised.id,
    changeType: change.changeType,
    beforeProposedFactId: change.before?.id ?? null,
    afterProposedFactId: change.after?.id ?? null,
  };
  const subjectKey = change.changeType === "REMOVED" && change.before?.id
    ? removalSubjectKey({ baseRevisionId: base.id, revisedRevisionId: revised.id, before: { ...change.before, id: change.before.id } })
    : proposedFactSubjectKey(change.after?.id ?? change.before?.id ?? "");
  return {
    subjectKey,
    documentTitle: revised.documentTitle,
    revisionLabel: `${base.revisionLabel} → ${revised.revisionLabel}`,
    label: focus ? describeFact(focus) : change.changeType,
    detail: `${change.changeType} · ${change.material ? "material" : "wording only"} · ${change.basis}`,
    evidence: (focus?.evidence ?? []).map((item) => ({ pageNumber: item.pageNumber, excerpt: item.excerpt })),
    currentDecision: latest.get(subjectMapKey(projectId, subjectKey)) ?? null,
    subject,
  };
}

function factFinding(
  projectId: string,
  revision: ProjectReviewSource["revisions"][number],
  fact: ProjectFactContext,
  latest: Map<string, ReviewDecisionRecord>,
): ProjectFinding {
  const subjectKey = proposedFactSubjectKey(fact.id);
  return {
    subjectKey,
    documentTitle: revision.documentTitle,
    revisionLabel: revision.revisionLabel,
    label: describeFact(fact),
    detail: "Proposed by extraction",
    evidence: fact.evidence.map((item) => ({ pageNumber: item.pageNumber, excerpt: item.excerpt })),
    currentDecision: latest.get(subjectMapKey(projectId, subjectKey)) ?? null,
    subject: { type: "proposed_fact", proposedFactId: fact.id },
  };
}

function factsFor(source: ProjectReviewSource, revisionId: string) {
  return storedFacts(source, revisionId).map(toComparableFact);
}

function storedFacts(source: ProjectReviewSource, revisionId: string) {
  const run = latestSucceededRun(source, revisionId);
  if (!run) return [];
  return source.facts
    .filter((fact) => fact.extractionRunId === run.id)
    .sort((left, right) => left.ordinal - right.ordinal);
}

function latestSucceededRun(source: ProjectReviewSource, revisionId: string) {
  return source.runs
    .filter((run) => (
      run.documentRevisionId === revisionId
      && run.status === "SUCCEEDED"
      && run.extractorName === CONSTRUCTION_FACTS_EXTRACTOR.name
      && run.extractorVersion === CONSTRUCTION_FACTS_EXTRACTOR.version
    ))
    .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
}

function latestBySubject(decisions: readonly ReviewDecisionRecord[]) {
  const latest = new Map<string, ReviewDecisionRecord>();
  const ordered = [...decisions].sort((left, right) => (
    left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
  ));
  for (const decision of ordered) latest.set(subjectMapKey(decision.projectId, decision.subjectKey), decision);
  return latest;
}

function subjectMapKey(projectId: string, subjectKey: string) {
  return `${projectId}\u0000${subjectKey}`;
}
