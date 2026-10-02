import type { ConstructionRepository } from "@/lib/domain/repository";
import { createProject } from "@/lib/projects/service";
import { createDocument } from "@/lib/documents/service";
import { createExtractionRun, advanceExtractionRun } from "@/lib/extractions/service";
import { recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { exportApprovedChangePacket, recordReviewDecision } from "@/lib/review/service";

export async function approvedPacketFixture(repository: ConstructionRepository, organizationId: string) {
  const project = await createProject(organizationId, { name: "ACC attachment QA" }, repository);
  const document = await createDocument(organizationId, project.id, { title: "Earthworks" }, repository);
  const text = "Excavation quantity is 1250 CY.";
  const revision = await repository.createRevision({
    documentId: document.id, revisionLabel: "A", originalFilename: "earthworks.pdf",
    mimeType: "application/pdf", byteSize: 100, sha256: "a".repeat(64),
    storageKey: `fixtures/${project.id}/earthworks.pdf`, status: "PROCESSED",
    pages: [{ pageNumber: 1, text, textSha256: "b".repeat(64) }],
  });
  const run = await createExtractionRun(organizationId, revision.id, {
    extractorName: "construction-facts", extractorVersion: "construction-facts-v1",
    provider: "test", model: "fixture",
  }, repository);
  await advanceExtractionRun(organizationId, run.id, { status: "RUNNING" }, repository);
  await recordProposedFacts(organizationId, run.id, [{
    type: "quantity", subject: "excavation", amount: "1250", unit: "CY", originalText: "1250 CY",
    modality: "asserted", evidence: [{ pageNumber: 1, excerpt: text, startOffset: 0, endOffset: text.length }],
  }], repository);
  const facts = await repository.listProposedFacts(organizationId, run.id);
  const fact = facts![0]!;
  const decision = await recordReviewDecision(organizationId, project.id, "Alex Chen", {
    decision: "ACCEPTED", subject: { type: "proposed_fact", proposedFactId: fact.id },
  }, repository, () => new Date("2026-10-01T12:00:00.000Z"));
  const packet = await exportApprovedChangePacket(organizationId, project.id, {}, repository);
  return { project, decision, fact, packet };
}
