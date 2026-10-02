import type { PrismaClient } from "@prisma/client";

export async function deletePacketFixture(db: PrismaClient, projectId: string) {
  await db.exportPacketChapterDecision.deleteMany({ where: { chapter: { projectId } } });
  await db.exportPacketChapter.deleteMany({ where: { projectId } });
  await db.exportPacketDecision.deleteMany({ where: { exportPacket: { projectId } } });
  await db.exportPacket.deleteMany({ where: { projectId } });
  const decisions = await db.reviewDecision.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  for (const decision of decisions) await db.reviewDecision.delete({ where: { id: decision.id } });
  const revisions = await db.documentRevision.findMany({ where: { document: { projectId } }, select: { id: true } });
  const ids = revisions.map((revision) => revision.id);
  await db.proposedFactEvidence.deleteMany({ where: { proposedFact: { extractionRun: { documentRevisionId: { in: ids } } } } });
  await db.proposedFact.deleteMany({ where: { extractionRun: { documentRevisionId: { in: ids } } } });
  await db.extractionRun.deleteMany({ where: { documentRevisionId: { in: ids } } });
  await db.documentPage.deleteMany({ where: { documentRevisionId: { in: ids } } });
  await db.documentRevision.deleteMany({ where: { id: { in: ids } } });
  await db.document.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
}
