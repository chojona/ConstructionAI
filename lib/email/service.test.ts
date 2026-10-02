import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import {
  ALREADY_RECORDED_MESSAGE,
  DRAFT_EMAIL_ACTION,
  DRAFT_EMAIL_TITLE,
  EMAIL_SURFACE_COPY,
  PACK_MISSING_MESSAGE,
  defaultEmailBody,
  defaultEmailSubject,
  draftEmailVisible,
  emailCopyIsAllowed,
} from "./emailSendView";
import { getEmailDraftSource, parseRecipients, readEmailSend, recordEmailSend, updateEmailDraft } from "./service";
import { EXPORT_BLOCKED_MESSAGE } from "@/lib/review/exportPacketView";
import { exportApprovedChangePacket, recordReviewDecision } from "@/lib/review/service";

const trench = "A CAT 336 excavator shall be used for the trench.";
const dozer = "A dozer shall be used.";
const PRODUCT_BANNED = /\b(dsc|fa|force account|force-account|change orders?|co|pco|entitlement|candidate|unpaid|claim)\b/i;

describe("draft email gate", () => {
  it("stays hidden until a change is approved and refuses banned copy", () => {
    expect(draftEmailVisible(0)).toBe(false);
    expect(draftEmailVisible(1)).toBe(true);
    expect(DRAFT_EMAIL_ACTION).toBe("Draft email");
    expect(DRAFT_EMAIL_TITLE).toBe("Draft email with approved pack");
    expect(PACK_MISSING_MESSAGE).toBe("Export or build pack first");
    const copy = [
      ...EMAIL_SURFACE_COPY,
      defaultEmailSubject("North River Bridge"),
      defaultEmailBody("North River Bridge"),
    ].join("\n");
    expect(emailCopyIsAllowed(copy)).toBe(true);
    expect(copy).not.toMatch(PRODUCT_BANNED);
    const client = ["components/review/draft-email.tsx", "components/review/export-packet.tsx", "components/review/pack-proof.tsx"]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(client).not.toMatch(PRODUCT_BANNED);
    expect(client).not.toMatch(/cold outreach|auto-send|claim filing/i);
    expect(client).not.toMatch(/node:crypto|from "@\/lib\/review\/exportPacket"|from "@\/lib\/email\/service"/);
  });

  it("requires an exported approved pack before a human send", async () => {
    const { repository, project, facts } = await scaffold();
    const clock = sequencedClock();
    await expect(getEmailDraftSource("org_a", project.id, repository)).resolves.toEqual({
      ready: false,
      message: EXPORT_BLOCKED_MESSAGE,
    });
    await expect(recordEmailSend("org_a", project.id, sendBody("packet_missing"), repository, clock)).rejects.toMatchObject({
      message: EXPORT_BLOCKED_MESSAGE,
    });

    const accepted = await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "DISMISSED",
      reason: "Wrong machine.",
      subject: { type: "proposed_fact", proposedFactId: facts.dozer.id },
    }, repository, clock);

    await expect(getEmailDraftSource("org_a", project.id, repository)).resolves.toEqual({
      ready: false,
      message: PACK_MISSING_MESSAGE,
    });

    await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    const source = await getEmailDraftSource("org_a", project.id, repository);
    expect(source.ready).toBe(true);
    if (!source.ready) return;
    expect(source.subject).toBe("I-95 Bridge — approved facts pack");
    expect(source.body).toBe(defaultEmailBody("I-95 Bridge"));
    expect(source.attachments).toEqual([
      expect.objectContaining({
        decisionId: accepted.id,
        documentId: project.documentId,
        documentTitle: "Drainage Plan",
        evidence: [expect.objectContaining({ pageNumber: 1, excerpt: trench })],
      }),
    ]);
    expect(source.attachments.map((item) => item.summary).join(" ")).not.toMatch(/dozer/i);
    expect(JSON.stringify(source)).not.toMatch(PRODUCT_BANNED);

    const draft = await recordEmailSend("org_a", project.id, {
      ...sendBody(source.exportPacketId),
      status: "DRAFT",
      recipients: "pm@example.com, owner@example.com",
    }, repository, clock);
    expect(draft).toMatchObject({
      status: "DRAFT",
      recipients: ["pm@example.com", "owner@example.com"],
      subject: "I-95 Bridge — approved facts pack",
      actorId: "Alex Chen",
      exportPacketId: source.exportPacketId,
      documentIds: [project.documentId],
      reviewDecisionIds: [accepted.id],
      sentAt: null,
    });
    expect(draft.reviewDecisionIds).not.toContain(repository.reviewDecisions.find((item) => item.decision === "DISMISSED")?.id);

    const sent = await updateEmailDraft("org_a", project.id, draft.id, {
      ...sendBody(source.exportPacketId),
      recipients: "accountant@example.com",
      body: "Approved changes for I-95 Bridge are attached as the approved facts pack.\nPlease review the cited pages.",
    }, repository, clock);
    expect(sent.id).toBe(draft.id);
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt).toBe(sent.updatedAt);
    expect(sent.recipients).toEqual(["accountant@example.com"]);
    expect(sent.documentIds).toEqual([project.documentId]);
    expect(sent.reviewDecisionIds).toEqual([accepted.id]);
    expect(repository.emailSends).toHaveLength(1);

    const ledger = await readEmailSend("org_a", project.id, sent.id, repository);
    expect(ledger).toEqual(sent);
    await expect(readEmailSend("org_b", project.id, sent.id, repository)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateEmailDraft("org_a", project.id, sent.id, sendBody(source.exportPacketId), repository, clock)).rejects.toMatchObject({
      message: ALREADY_RECORDED_MESSAGE,
    });
  });

  it("refuses a stale pack after another change is approved", async () => {
    const { repository, project, facts } = await scaffold();
    const clock = sequencedClock();
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.trench.id },
    }, repository, clock);
    await exportApprovedChangePacket("org_a", project.id, {}, repository, clock);
    const first = await getEmailDraftSource("org_a", project.id, repository);
    if (!first.ready) throw new Error("Expected a pack");
    await recordReviewDecision("org_a", project.id, "pm-1", {
      decision: "ACCEPTED",
      subject: { type: "proposed_fact", proposedFactId: facts.pump.id },
    }, repository, clock);
    await expect(recordEmailSend("org_a", project.id, sendBody(first.exportPacketId), repository, clock)).rejects.toMatchObject({
      message: PACK_MISSING_MESSAGE,
    });
    expect(repository.emailSends).toHaveLength(0);
  });

  it("parses the free-text To field", () => {
    expect(parseRecipients(" pm@example.com, owner@example.com;\nDOT AE ")).toEqual([
      "pm@example.com",
      "owner@example.com",
      "DOT AE",
    ]);
    expect(() => parseRecipients(" , ; ")).toThrow(expect.objectContaining({ message: "Enter at least one recipient." }));
  });
});

function sendBody(exportPacketId: string) {
  return {
    recipients: "pm@example.com",
    subject: "I-95 Bridge — approved facts pack",
    body: defaultEmailBody("I-95 Bridge"),
    actorId: "Alex Chen",
    exportPacketId,
    status: "SENT" as const,
  };
}

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  repository.addOrganization("org_b");
  const project = await repository.createProject({ organizationId: "org_a", name: "I-95 Bridge" });
  const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Drainage Plan" });
  const revision = await repository.createRevision({
    documentId: document!.id,
    revisionLabel: "A",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    byteSize: 10,
    sha256: "a".repeat(64),
    storageKey: "revisions/a.pdf",
    status: "PROCESSED",
    pages: [{ pageNumber: 1, text: [trench, dozer].join("\n"), textSha256: "c".repeat(64) }],
  });
  const stored = await propose(repository, revision.id, [
    equipmentFact(trench, "CAT 336"),
    equipmentFact(dozer, "dozer"),
    equipmentFact("A pump shall dewater the excavation.", "pump"),
  ]);
  return {
    repository,
    project: { id: project.id, documentId: document!.id, revisionId: revision.id },
    facts: { trench: stored[0]!, dozer: stored[1]!, pump: stored[2]! },
  };
}

async function propose(
  repository: MemoryRepository,
  documentRevisionId: string,
  facts: Array<{ factType: "equipment_requirement"; payload: Record<string, string | null>; excerpt: string }>,
) {
  const revision = await repository.getRevision("org_a", documentRevisionId);
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  if (!queued || !revision) throw new Error("Missing extraction run");
  await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
  });
  await repository.commitProposedFacts({
    organizationId: "org_a",
    extractionRunId: queued.id,
    expectedStatus: "RUNNING",
    completedAt: new Date("2026-09-30T18:00:00.000Z"),
    facts: facts.map((fact) => ({
      factType: fact.factType,
      payload: fact.payload,
      evidence: [{
        documentPageId: revision.pages[0]!.id,
        pageNumber: 1,
        excerpt: fact.excerpt,
        startOffset: 0,
        endOffset: fact.excerpt.length,
      }],
    })),
  });
  return repository.proposedFacts.filter((fact) => fact.extractionRunId === queued.id);
}

function equipmentFact(excerpt: string, equipment: string) {
  return {
    factType: "equipment_requirement" as const,
    excerpt,
    payload: { equipment, statement: excerpt, modality: "asserted" },
  };
}

function sequencedClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 30, 12, tick++));
}
