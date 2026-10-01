import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR, parseConstructionFactsV1, type ProposedConstructionFact } from "@/lib/extractions/constructionFacts";
import { extractConstructionFacts } from "@/lib/extractions/deterministicExtractor";
import type { ProjectFactContext, ProjectReviewSource, ReviewDecisionRecord } from "@/lib/domain/types";
import { HEAVYJOB_DEMO_PROJECT_ID } from "@/lib/heavyjob/fixtures";
import { compareFacts, type ComparableFact } from "@/lib/revisions/compareFacts";
import { listAttention } from "@/lib/review/attention";
import { listProjectFindings } from "@/lib/review/findings";
import { scoreRevisionChange } from "@/lib/review/severity";
import { proposedFactSubjectKey } from "@/lib/review/subjects";
import {
  DEMO_DESK_PROJECTS,
  DEMO_REVIEW_DOCUMENT_ID,
  DEMO_REVIEW_PROJECT_ID,
  DEMO_REVIEW_REVISIONS,
  type DemoProjectSeed,
} from "./reviewProject";

const BANNED_COPY = /\b(dsc|fa|force account|force-account|change orders?|co|pco|entitlement|candidate|unpaid|claim)\b/i;

describe("demo review project", () => {
  it("reuses the quantity fixture so change review has a material finding", () => {
    const [before, after] = DEMO_REVIEW_REVISIONS.map((revision) => (
      extractConstructionFacts([{ pageNumber: 1, text: revision.text }]).facts.map(toComparable)
    ));
    expect(before.map((fact) => fact.payload.amount)).toEqual(["1250"]);
    expect(after.map((fact) => fact.payload.amount)).toEqual(["1500"]);
    const changes = compareFacts(before, after);
    expect(changes).toEqual([
      expect.objectContaining({ changeType: "MODIFIED", category: "quantity", material: true }),
    ]);
    const scored = scoreRevisionChange(changes[0]!);
    expect(scored.disposition).toBe("material_change");
    expect(scored.severity).not.toBe("low");
  });

  it("builds a mixed civil and commercial desk with sticky decisions", () => {
    expect(DEMO_DESK_PROJECTS.map((project) => project.id)).not.toContain(HEAVYJOB_DEMO_PROJECT_ID);
    expect(DEMO_DESK_PROJECTS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_DESK_PROJECTS[0]).toMatchObject({
      id: DEMO_REVIEW_PROJECT_ID,
      sector: "civil",
    });
    expect(DEMO_DESK_PROJECTS[0]?.documents[0]?.id).toBe(DEMO_REVIEW_DOCUMENT_ID);
    expect(DEMO_DESK_PROJECTS.filter((project) => project.sector === "civil").length).toBeGreaterThanOrEqual(2);
    expect(DEMO_DESK_PROJECTS.filter((project) => project.sector === "civil").length).toBeLessThanOrEqual(3);
    expect(DEMO_DESK_PROJECTS.filter((project) => project.sector === "commercial").length).toBeGreaterThanOrEqual(1);
    expect(DEMO_DESK_PROJECTS.filter((project) => project.sector === "commercial").length).toBeLessThanOrEqual(2);

    const documentCounts = DEMO_DESK_PROJECTS.map((project) => project.documents.length);
    expect(new Set(documentCounts).size).toBeGreaterThan(1);

    const previews = DEMO_DESK_PROJECTS.map((project) => ({ project, items: attentionFor(project) }));
    const busy = previews.filter((preview) => preview.items.length > 0);
    const settled = previews.filter((preview) => preview.items.length === 0 && preview.project.documents.length > 0);
    expect(busy.length).toBeGreaterThanOrEqual(2);
    expect(settled.length).toBeGreaterThanOrEqual(1);

    for (const preview of busy) {
      expect(preview.items.length).toBeGreaterThanOrEqual(3);
      expect(preview.items.length).toBeLessThanOrEqual(8);
      expect(preview.project.documents.some((document) => document.revisions.length >= 2)).toBe(true);
      expect(preview.items.some((item) => item.finding.subject.type === "revision_change")).toBe(true);
      const categories = new Set(preview.items.map((item) => (item.finding.after ?? item.finding.before)?.category));
      expect(categories).toEqual(new Set(["quantity", "schedule_date", "equipment_requirement"]));
      for (const item of preview.items) {
        expect(item.finding.evidence[0]?.excerpt.length).toBeGreaterThan(0);
      }
      const decisions = preview.project.documents.flatMap((document) => document.decisions);
      expect(decisions.some((decision) => decision.decision === "ACCEPTED")).toBe(true);
      expect(decisions.some((decision) => decision.decision === "DISMISSED" && decision.reason)).toBe(true);
    }

    for (const project of DEMO_DESK_PROJECTS) {
      expect(`${project.name} ${project.projectNumber}`).not.toMatch(BANNED_COPY);
      for (const document of project.documents) {
        const copy = `${document.title} ${document.revisions.map((revision) => revision.text).join("\n")} ${document.decisions.map((decision) => decision.reason ?? "").join(" ")}`;
        expect(copy).not.toMatch(BANNED_COPY);
      }
    }
  });
});

function attentionFor(project: DemoProjectSeed) {
  const revisions: ProjectReviewSource["revisions"] = [];
  const runs: ProjectReviewSource["runs"] = [];
  const facts: ProjectFactContext[] = [];
  const decisions: ReviewDecisionRecord[] = [];
  for (const document of project.documents) {
    for (const revision of document.revisions) {
      const page = { pageNumber: 1, text: revision.text };
      const extracted = parseConstructionFactsV1(extractConstructionFacts([page]), [page]);
      const runId = `${revision.id}-run`;
      revisions.push({
        id: revision.id,
        documentId: document.id,
        documentTitle: document.title,
        revisionLabel: revision.label,
        revisionOrder: revision.order,
      });
      runs.push({
        id: runId,
        documentRevisionId: revision.id,
        attemptNumber: 1,
        extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
        extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
        status: "SUCCEEDED",
      });
      extracted.forEach((fact, ordinal) => {
        facts.push({
          id: `${revision.id}-fact-${ordinal}`,
          extractionRunId: runId,
          documentRevisionId: revision.id,
          ordinal,
          factType: fact.type,
          payload: payloadOf(fact),
          evidence: fact.evidence.map((item) => ({ ...item, documentPageId: `${revision.id}-page` })),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        });
      });
    }
    for (const decision of document.decisions) {
      const factId = `${document.revisions.find((revision) => revision.order === decision.revisionOrder)?.id}-fact-${decision.ordinal}`;
      decisions.push({
        id: `${factId}-decision`,
        projectId: project.id,
        subjectKind: "PROPOSED_FACT",
        subjectKey: proposedFactSubjectKey(factId),
        decision: decision.decision,
        reviewerId: "demo-seed",
        reason: decision.reason,
        proposedFactId: factId,
        beforeProposedFactId: null,
        afterProposedFactId: null,
        baseRevisionId: null,
        revisedRevisionId: null,
        changeType: null,
        supersedesDecisionId: null,
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
      });
    }
  }
  return listAttention(listProjectFindings({ projectId: project.id, revisions, runs, facts }, decisions));
}

function toComparable(fact: ProposedConstructionFact, index: number): ComparableFact {
  return { factType: fact.type, ordinal: index, payload: payloadOf(fact), evidence: fact.evidence.map((item) => ({ ...item })) };
}

function payloadOf(fact: ProposedConstructionFact): Record<string, string | null> {
  if (fact.type === "equipment_requirement") return { equipment: fact.equipment, statement: fact.statement, modality: fact.modality };
  if (fact.type === "schedule_date") return { event: fact.event, date: fact.date, dateText: fact.dateText, modality: fact.modality };
  return { subject: fact.subject, amount: fact.amount, unit: fact.unit, originalText: fact.originalText, modality: fact.modality };
}
