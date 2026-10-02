/**
 * Pin ExportPacketChapter.pageCites that are still bare page strings ("2", "C-101").
 *
 * Frozen approved-pack payloads are left unchanged. After a row is pinned, re-attach
 * the markup summary on the desk so the next pack stores revisionId, revisionLabel, and page.
 *
 * List legacy rows:
 *   npx tsx scripts/migrate-legacy-page-cites.ts
 *
 * Pin one project's rows to a document revision, then print the planned JSON:
 *   npx tsx scripts/migrate-legacy-page-cites.ts --project-id <id> --revision-id <id>
 *
 * Write those pins:
 *   npx tsx scripts/migrate-legacy-page-cites.ts --project-id <id> --revision-id <id> --apply
 */
import { createPrismaClient } from "../lib/db";
import { legacyBarePageTokens, pinLegacyPageCites } from "../lib/review/exportPacketView";

const args = new Map<string, string>();
const flags = new Set<string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index] ?? "";
  if (arg === "--apply") flags.add(arg);
  else if (arg.startsWith("--")) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    args.set(arg, value);
    index += 1;
  }
}

const projectId = args.get("--project-id");
const revisionId = args.get("--revision-id");
const apply = flags.has("--apply");
if (apply && (!projectId || !revisionId)) {
  throw new Error("--apply requires --project-id and --revision-id");
}
if (Boolean(projectId) !== Boolean(revisionId)) {
  throw new Error("Pass --project-id and --revision-id together");
}

const db = createPrismaClient();

try {
  const chapters = await db.exportPacketChapter.findMany({
    where: {
      role: "bluebeam-markup",
      ...(projectId ? { projectId } : {}),
    },
    select: { id: true, projectId: true, sourceId: true, pageCites: true },
    orderBy: { createdAt: "asc" },
  });
  const legacy = chapters.flatMap((chapter) => {
    const pages = legacyBarePageTokens(chapter.pageCites);
    return pages ? [{ ...chapter, pages }] : [];
  });
  if (legacy.length === 0) {
    console.log("No bare page cites.");
  } else {
    for (const chapter of legacy) {
      console.log(`${chapter.projectId} ${chapter.id} ${chapter.sourceId} pages=${chapter.pages.join(",")}`);
    }
  }

  if (!projectId || !revisionId) {
    if (legacy.length > 0) console.log("Re-attach each appendix, or pass --project-id and --revision-id to pin that project's rows.");
  } else {
    const revision = await db.documentRevision.findFirst({
      where: { id: revisionId, document: { projectId } },
      select: { id: true, revisionLabel: true, sha256: true },
    });
    if (!revision) throw new Error(`Revision ${revisionId} is not on project ${projectId}`);
    const targets = legacy.filter((chapter) => chapter.projectId === projectId);
    for (const chapter of targets) {
      const pinned = pinLegacyPageCites(chapter.pageCites, {
        revisionId: revision.id,
        revisionLabel: revision.revisionLabel,
        contentHash: revision.sha256,
      });
      if (!pinned) throw new Error(`Chapter ${chapter.id} is not a bare page-cite row`);
      console.log(`${apply ? "update" : "plan"} ${chapter.id} -> ${pinned.join(" | ")}`);
      if (apply) {
        await db.exportPacketChapter.update({
          where: { id: chapter.id },
          data: { pageCites: pinned },
        });
      }
    }
    if (targets.length === 0) console.log(`No bare page cites on ${projectId}.`);
    else if (!apply) console.log("Dry run. Pass --apply to write the pins, then re-attach the markup summary.");
  }
} finally {
  await db.$disconnect();
}
