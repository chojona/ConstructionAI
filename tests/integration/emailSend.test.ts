import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocument } from "@/lib/documents/service";
import { PrismaConstructionRepository } from "@/lib/domain/prismaRepository";
import { getEmailDraftSource, readEmailSend, recordEmailSend } from "@/lib/email/service";
import { PACK_MISSING_MESSAGE } from "@/lib/email/emailSendView";
import { recordProposedFacts } from "@/lib/extractions/proposedFacts";
import { advanceExtractionRun, createExtractionRun } from "@/lib/extractions/service";
import { createProject } from "@/lib/projects/service";
import { EXPORT_BLOCKED_MESSAGE } from "@/lib/review/exportPacketView";
import { exportApprovedChangePacket, readStoredExportPacket, recordReviewDecision } from "@/lib/review/service";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

const approvedExcerpt = "A CAT 336 excavator shall be used for the trench.";
const rejectedExcerpt = "A dozer shall be used.";
const provenance = {
  extractorName: "construction-facts",
  extractorVersion: "construction-facts-v1",
  provider: "openai",
  model: "gpt-4.1",
};

describe.skipIf(!hasIntegrationDatabase)("Prisma email send ledger", () => {
  const db = integrationDb();
  const repository = new PrismaConstructionRepository(db);
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const organizationId = `it_email_${suffix}`;

  beforeAll(async () => {
    await db.organization.create({ data: { id: organizationId, name: "Email ledger" } });
  });

  afterAll(async () => {
    const projects = await db.project.findMany({ where: { organizationId }, select: { id: true } });
    const projectIds = projects.map(({ id }) => id);
    await db.emailSendDecision.deleteMany({ where: { emailSend: { projectId: { in: projectIds } } } });
    await db.emailSendDocument.deleteMany({ where: { emailSend: { projectId: { in: projectIds } } } });
    await db.emailSend.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.exportPacketDecision.deleteMany({ where: { exportPacket: { projectId: { in: projectIds } } } });
    await db.exportPacket.deleteMany({ where: { projectId: { in: projectIds } } });
    const decisions = await db.reviewDecision.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    for (const decision of decisions) await db.reviewDecision.delete({ where: { id: decision.id } });
    const documents = await db.document.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const documentIds = documents.map(({ id }) => id);
    const revisions = await db.documentRevision.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
    const revisionIds = revisions.map(({ id }) => id);
    const runs = await db.extractionRun.findMany({ where: { documentRevisionId: { in: revisionIds } }, select: { id: true } });
    const runIds = runs.map(({ id }) => id);
    await db.proposedFactEvidence.deleteMany({ where: { proposedFact: { extractionRunId: { in: runIds } } } });
    await db.proposedFact.deleteMany({ where: { extractionRunId: { in: runIds } } });
    await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentPage.deleteMany({ where: { documentRevisionId: { in: revisionIds } } });
    await db.documentRevision.deleteMany({ where: { id: { in: revisionIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.organization.delete({ where: { id: organizationId } });
    await db.$disconnect();
  });

  it("records recipients, pack, documents, and decisions only after export", async () => {
    const project = await createProject(organizationId, { name: "Email bridge" }, repository);
    await expect(getEmailDraftSource(organizationId, project.id, repository)).resolves.toEqual({
      ready: false,
      message: EXPORT_BLOCKED_MESSAGE,
    });
    const document = await createDocument(organizationId, project.id, { title: "Drainage Plan" }, repository);
    const revision = await repository.createRevision({
      documentId: document.id,
      revisionLabel: "A",
      originalFilename: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 20,
      sha256: `m${suffix}`.padEnd(64, "0").slice(0, 64),
      storageKey: `revisions/email-${suffix}.pdf`,
      status: "PROCESSED",
      pages: [{ pageNumber: 1, text: `${approvedExcerpt}\n${rejectedExcerpt}`, textSha256: "f".repeat(64) }],
    });
    const run = await createExtractionRun(organizationId, revision.id, provenance, repository);
    await advanceExtractionRun(organizationId, run.id, { status: "RUNNING" }, repository);
    await recordProposedFacts(organizationId, run.id, [
      fact(approvedExcerpt, "CAT 336", 0),
      fact(rejectedExcerpt, "dozer", approvedExcerpt.length + 1),
    ], repository);
    const facts = await db.proposedFact.findMany({ where: { extractionRunId: run.id }, orderBy: { ordinal: "asc" } });
    const accepted = await recordReviewDecision(organizationId, project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts[0]!.id },
    }, repository, () => new Date("2026-10-01T15:00:00.000Z"));
    const dismissed = await recordReviewDecision(organizationId, project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts[1]!.id },
    }, repository, () => new Date("2026-10-01T15:01:00.000Z"));

    await expect(getEmailDraftSource(organizationId, project.id, repository)).resolves.toMatchObject({
      ready: false,
      message: PACK_MISSING_MESSAGE,
    });
    await exportApprovedChangePacket(organizationId, project.id, {}, repository, () => new Date("2026-10-01T15:02:00.000Z"));
    const source = await getEmailDraftSource(organizationId, project.id, repository);
    expect(source.ready).toBe(true);
    if (!source.ready) return;

    const draftedAt = new Date("2026-10-01T15:02:30.000Z");
    const draft = await recordEmailSend(organizationId, project.id, {
      recipients: "draft@example.com",
      subject: "Email bridge — approved facts pack",
      body: "Approved changes for Email bridge are attached as the approved facts pack.\nThe pack lists each accepted change and the page it cites.",
      actorId: "Alex Chen",
      exportPacketId: source.exportPacketId,
      status: "DRAFT",
    }, repository, () => draftedAt);
    expect(draft.status).toBe("DRAFT");
    expect(draft.sentAt).toBeNull();

    const sentAt = new Date("2026-10-01T15:03:00.000Z");
    const email = await recordEmailSend(organizationId, project.id, {
      recipients: "pm@example.com, DOT AE",
      subject: "Email bridge — approved facts pack",
      body: "Approved changes for Email bridge are attached as the approved facts pack.\nThe pack lists each accepted change and the page it cites.",
      actorId: "Alex Chen",
      exportPacketId: source.exportPacketId,
      status: "SENT",
    }, repository, () => sentAt);

    expect(email).toMatchObject({
      status: "SENT",
      recipients: ["pm@example.com", "DOT AE"],
      subject: "Email bridge — approved facts pack",
      actorId: "Alex Chen",
      exportPacketId: source.exportPacketId,
      documentIds: [document.id],
      reviewDecisionIds: [accepted.id],
      sentAt: sentAt.toISOString(),
    });
    expect(email.reviewDecisionIds).not.toContain(dismissed.id);
    const storedPacket = await readStoredExportPacket(organizationId, project.id, email.exportPacketId, repository);
    expect(storedPacket.reviewDecisionIds).toEqual([accepted.id]);
    expect(storedPacket.byteSize).toBe(storedPacket.payload.byteLength);
    const stored = await db.emailSend.findUniqueOrThrow({
      where: { id: email.id },
      include: {
        decisions: { orderBy: { ordinal: "asc" } },
        documents: { orderBy: { ordinal: "asc" } },
      },
    });
    expect(stored.status).toBe("SENT");
    expect(stored.decisions.map((link) => link.reviewDecisionId)).toEqual([accepted.id]);
    expect(stored.documents.map((link) => link.documentId)).toEqual([document.id]);
    expect(await readEmailSend(organizationId, project.id, email.id, repository)).toMatchObject({ id: email.id, status: "SENT" });
  });
});

function fact(excerpt: string, equipment: string, startOffset: number) {
  return {
    type: "equipment_requirement" as const,
    equipment,
    statement: excerpt,
    modality: "asserted" as const,
    evidence: [{ pageNumber: 1, excerpt, startOffset, endOffset: startOffset + excerpt.length }],
  };
}
