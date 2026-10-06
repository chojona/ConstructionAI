import { describe, expect, it } from "vitest";
import { CONSTRUCTION_FACTS_EXTRACTOR } from "@/lib/extractions/constructionFacts";
import { MemoryRepository } from "@/tests/support/memoryRepository";
import { exportApprovedChangePacket, getProjectReview, recordReviewDecision } from "@/lib/review/service";
import { signoffForReviewer } from "./approvalSignoff";
import { disableMember } from "./people";
import type { OrgAccess } from "./membership";
import { applyOrgAdminRelease, createReleaseQueue } from "./orgAdminRelease";
import type { MembershipRecord, OrgAdminRelease, OrgRole, PeopleStore, PersonMembership, PersonRecord, ReviewerDirectoryEntry } from "./roles";

const trench = "A CAT 336 excavator shall be used for the trench.";
const acceptedAt = new Date("2026-10-06T15:04:00.000Z");

describe("approved-by ledger", () => {
  it("keeps the accepted fact and frozen pack after the reviewer is disabled", async () => {
    const { repository, project, fact } = await scaffold();
    const store = new MemoryPeople();
    const admin = await store.createUser({ email: "lead@northstar.example", name: "Lead" });
    await store.createMembership({ organizationId: "org_a", userId: admin.id, role: "ORG_ADMIN", status: "ACTIVE" });
    const reviewer = await store.createUser({ email: "avery@northstar.example", name: "Avery Quinn" });
    const reviewerMembership = await store.createMembership({
      organizationId: "org_a",
      userId: reviewer.id,
      role: "REVIEWER",
      status: "ACTIVE",
    });

    const decision = await recordReviewDecision("org_a", project.id, reviewer.id, {
      decision: "ACCEPTED",
      reason: "Confirmed on sheet C-101.",
      subject: { type: "proposed_fact", proposedFactId: fact.id },
    }, repository, () => acceptedAt);
    const packet = await exportApprovedChangePacket("org_a", project.id, {}, repository, () => acceptedAt);
    const storedPayload = Buffer.from(repository.exportPackets[0]!.payload);
    const storedHash = repository.exportPackets[0]!.contentHash;

    await disableMember(adminAccess(), reviewerMembership.id, store);

    const review = await getProjectReview("org_a", project.id, repository);
    expect(review.state.facts[0]).toMatchObject({
      reviewerId: reviewer.id,
      acceptedAt,
    });
    expect(repository.reviewDecisions).toEqual([expect.objectContaining({
      id: decision.id,
      reviewerId: reviewer.id,
      createdAt: acceptedAt,
    })]);
    expect(repository.exportPackets).toHaveLength(1);
    expect(Buffer.from(repository.exportPackets[0]!.payload).equals(storedPayload)).toBe(true);
    expect(repository.exportPackets[0]!.contentHash).toBe(storedHash);
    expect(packet.changes[0]).toMatchObject({ reviewerId: reviewer.id, approvedAt: acceptedAt.toISOString() });

    const directory = await store.listReviewerDirectory("org_a");
    expect(signoffForReviewer(reviewer.id, directory)).toEqual({ name: "Avery Quinn", disabled: true });
    expect((await store.findMembershipById(reviewerMembership.id))?.status).toBe("DISABLED");
  });
});

function adminAccess(): OrgAccess {
  return { organizationId: "org_a", userId: "user_org_admin", role: "ORG_ADMIN", named: true };
}

class MemoryPeople implements PeopleStore {
  users: PersonRecord[] = [];
  memberships: MembershipRecord[] = [];
  private sequence = 0;
  private exclusive = createReleaseQueue();

  async findMembership(userId: string, organizationId: string) {
    return this.memberships.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null;
  }

  async listActiveMemberships(userId: string) {
    return this.memberships.filter((row) => row.userId === userId && row.status === "ACTIVE");
  }

  async listMembershipsForUser(userId: string) {
    return this.memberships.filter((row) => row.userId === userId);
  }

  async findUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createUser(input: { email: string; name: string | null }) {
    const user = { id: `user_${++this.sequence}`, email: input.email, name: input.name };
    this.users.push(user);
    return user;
  }

  async createMembership(input: { organizationId: string; userId: string; role: OrgRole; status: MembershipRecord["status"] }) {
    const row: MembershipRecord = { id: `membership_${++this.sequence}`, ...input };
    this.memberships.push(row);
    return row;
  }

  async findMembershipById(id: string) {
    return this.memberships.find((row) => row.id === id) ?? null;
  }

  async setStatus(id: string, status: MembershipRecord["status"]) {
    const row = this.memberships.find((item) => item.id === id);
    if (!row) throw new Error(`missing ${id}`);
    row.status = status;
    return row;
  }

  async setRole(id: string, role: OrgRole) {
    const row = this.memberships.find((item) => item.id === id);
    if (!row) throw new Error(`missing ${id}`);
    row.role = role;
    return row;
  }

  releaseOrgAdmin(id: string, change: OrgAdminRelease) {
    return this.exclusive(() => applyOrgAdminRelease(this.memberships, id, change));
  }

  async acceptPending() {
    return false;
  }

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.memberships.filter((row) => row.organizationId === organizationId && row.role === role && row.status === "ACTIVE").length;
  }

  async listPeople(): Promise<PersonMembership[]> {
    return [];
  }

  async listReviewerDirectory(organizationId: string): Promise<ReviewerDirectoryEntry[]> {
    return this.memberships.filter((row) => row.organizationId === organizationId).map((row) => ({
      userId: row.userId,
      name: this.users.find((user) => user.id === row.userId)?.name ?? null,
      email: this.users.find((user) => user.id === row.userId)?.email ?? null,
      status: row.status,
    }));
  }

  async saveAcceptToken() {}
}

async function scaffold() {
  const repository = new MemoryRepository();
  repository.addOrganization("org_a");
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
    pages: [{ pageNumber: 1, text: trench, textSha256: "c".repeat(64) }],
  });
  const queued = await repository.createExtractionRun({
    organizationId: "org_a",
    documentRevisionId: revision.id,
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: "openai",
    model: "gpt-4.1",
  });
  if (!queued) throw new Error("Missing extraction run");
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
    facts: [{
      factType: "equipment_requirement",
      payload: { equipment: "CAT 336", statement: trench, modality: "asserted" },
      evidence: [{
        documentPageId: revision.pages[0]!.id,
        pageNumber: 1,
        excerpt: trench,
        startOffset: 0,
        endOffset: trench.length,
      }],
    }],
  });
  const fact = repository.proposedFacts.find((item) => item.extractionRunId === queued.id);
  if (!fact) throw new Error("Missing fact");
  return { repository, project, fact };
}
