import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import {
  assertEmailLedgerOnlyAtEntrypoints,
  assertEmailSurfaceCopyAllowed,
  assertEmailUiDoesNotImplyDelivery,
  assertNoMailDeliveryInSource,
  listProjectSourceFiles,
} from "./noAutoSendGuard";
import { defaultEmailBody, HUMAN_SEND_RECORDED, SEND_RECORDED_MESSAGE } from "./emailSendView";
import { recordEmailSend } from "./service";
import { exportApprovedChangePacket, recordReviewDecision } from "@/lib/review/service";

const repoRoot = process.cwd();

describe("CON-78 no auto-send wall", () => {
  it("keeps mail delivery SDKs and background senders out of the codebase", () => {
    const files = listProjectSourceFiles(repoRoot);
    for (const file of files) {
      assertNoMailDeliveryInSource(readFileSync(join(repoRoot, file), "utf8"), file);
    }
    assertEmailLedgerOnlyAtEntrypoints(repoRoot, files);
    assertEmailSurfaceCopyAllowed();
    assertEmailUiDoesNotImplyDelivery(repoRoot);
  });

  it("records draft and sent as separate ledger states", async () => {
    const { repository, project, exportPacketId } = await scaffold();
    const clock = () => new Date("2026-10-02T12:00:00.000Z");

    const draft = await recordEmailSend("org_a", project.id, {
      recipients: "pm@example.com",
      subject: "Bridge — approved facts pack",
      body: defaultEmailBody("Bridge"),
      actorId: "Alex Chen",
      exportPacketId,
      status: "DRAFT",
    }, repository, clock);
    expect(draft.status).toBe("DRAFT");
    expect(draft.sentAt).toBeNull();

    const sent = await recordEmailSend("org_a", project.id, {
      recipients: "owner@example.com",
      subject: "Bridge — approved facts pack",
      body: defaultEmailBody("Bridge"),
      actorId: "Alex Chen",
      exportPacketId,
      status: "SENT",
    }, repository, clock);
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt).not.toBeNull();
    expect(repository.emailSends).toHaveLength(2);
    expect(repository.emailSends.filter((row) => row.status === "DRAFT")).toHaveLength(1);
    expect(repository.emailSends.filter((row) => row.status === "SENT")).toHaveLength(1);
  });

  it("uses ledger-only copy for human send, not delivery claims", () => {
    expect(SEND_RECORDED_MESSAGE).toBe("Send recorded.");
    expect(HUMAN_SEND_RECORDED).toBe("Human send recorded.");
    const client = ["components/review/draft-email.tsx", "app/(desk)/projects/[projectId]/emails/[emailSendId]/page.tsx"]
      .map((file) => readFileSync(join(repoRoot, file), "utf8"))
      .join("\n");
    expect(client).not.toMatch(/\bmailed\b/i);
    expect(client).not.toMatch(/\bdelivered\b/i);
  });
});

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
  const project = await repository.createProject({ organizationId: "org_a", name: "Bridge" });
  const document = await repository.createDocument({ organizationId: "org_a", projectId: project.id, title: "Plan" });
  const revision = await repository.createRevision({
    documentId: document!.id,
    revisionLabel: "A",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    byteSize: 10,
    sha256: "a".repeat(64),
    storageKey: "revisions/a.pdf",
    status: "PROCESSED",
    pages: [{ pageNumber: 1, text: "A CAT 336 excavator shall be used.", textSha256: "c".repeat(64) }],
  });
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId: revision!.id,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  await repository.applyExtractionRunTransition({
    organizationId: "org_a",
    extractionRunId: queued!.id,
    expectedStatus: "QUEUED",
    status: "RUNNING",
  });
  await repository.commitProposedFacts({
    organizationId: "org_a",
    extractionRunId: queued!.id,
    expectedStatus: "RUNNING",
    completedAt: new Date("2026-09-30T18:00:00.000Z"),
    facts: [{
      factType: "equipment_requirement",
      payload: { equipment: "CAT 336", statement: "A CAT 336 excavator shall be used.", modality: "asserted" },
      evidence: [{
        documentPageId: revision!.pages[0]!.id,
        pageNumber: 1,
        excerpt: "A CAT 336 excavator shall be used.",
        startOffset: 0,
        endOffset: 35,
      }],
    }],
  });
  const fact = repository.proposedFacts.find((item) => item.extractionRunId === queued!.id)!;
  await recordReviewDecision("org_a", project.id, "pm-1", {
    decision: "ACCEPTED",
    subject: { type: "proposed_fact", proposedFactId: fact.id },
  }, repository, () => new Date("2026-10-01T10:00:00.000Z"));
  await exportApprovedChangePacket("org_a", project.id, {}, repository, () => new Date("2026-10-01T11:00:00.000Z"));
  const stored = repository.exportPackets[0];
  if (!stored) throw new Error("Expected exported pack");
  expect(repository.emailSends).toHaveLength(0);
  return {
    repository,
    project: { id: project.id },
    exportPacketId: stored.id,
  };
}
