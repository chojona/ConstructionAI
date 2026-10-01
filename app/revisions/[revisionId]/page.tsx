import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionInspection } from "@/components/documents/revision-inspection";
import { SourceDocument } from "@/components/review/source-document";
import { ProjectContext } from "@/components/workspace/project-context";
import { ProjectNavigation } from "@/components/workspace/project-navigation";
import { getDocument, getRevision, listRevisionAnalysis } from "@/lib/documents/service";
import { DomainError } from "@/lib/domain/errors";
import { parseEvidenceTarget, safeReturnPath } from "@/lib/review/evidenceLocation";
import { getProjectReview } from "@/lib/review/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(value);

export default async function RevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>;
  searchParams: Promise<{ page?: string; start?: string; end?: string; quote?: string; return?: string }>;
}) {
  const { revisionId } = await params;
  const query = await searchParams;
  const returnTo = safeReturnPath(query.return);
  const target = parseEvidenceTarget(query);
  const organizationId = currentOrganizationId();

  let revision;
  try {
    revision = await getRevision(organizationId, revisionId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [document, runs, review] = await Promise.all([
    getDocument(organizationId, revision.document.id),
    listRevisionAnalysis(organizationId, revision.id),
    getProjectReview(organizationId, revision.document.project.id).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
      throw error;
    }),
  ]);

  const findings = (review?.findings ?? []).filter((finding) => (
    finding.sources.some((source) => source.revisionId === revision.id)
    || (finding.subject.type === "revision_change" && finding.subject.revisedRevisionId === revision.id)
  ));

  return (
    <main className="page reading">
      <ProjectContext projectId={revision.document.project.id}>
        <Link href="/projects">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${revision.document.project.id}`}>{revision.document.project.name}</Link>
        <span>/</span>
        <Link href={`/documents/${revision.document.id}`}>{revision.document.title}</Link>
        <span>/</span>
        <span>{revision.revisionLabel}</span>
      </ProjectContext>
      <p className="eyebrow">{revision.document.documentType || "Document"} · {revision.document.title}</p>
      <RevisionInspection
        revision={{ ...revision, pageCount: revision.pages.length }}
        siblings={document.revisions}
        runs={runs}
        findings={findings}
        uploadedLabel={date(revision.createdAt)}
        returnTo={returnTo}
        navigation={<ProjectNavigation projectId={revision.document.project.id} active="documents" />}
      />
      <div className="source-heading-row">
        <h2 className="source-heading" id="source-heading">Source pages</h2>
        {returnTo ? <Link className="return-link" href={returnTo}>Back to decision</Link> : null}
      </div>
      {target ? (
        <p className="evidence-banner" role="status">This view is open at the cited passage.</p>
      ) : null}
      <div className="revision-layout">
        <nav className="revision-index" aria-label="Source pages">
          <h2>Pages</h2>
          {revision.pages.map((page) => {
            const active = target?.pageId === page.id;
            return (
              <a aria-current={active ? "page" : undefined} className={active ? "is-active" : undefined} href={active ? "#evidence" : `#page-${page.id}`} key={page.id}>
                Page {page.pageNumber}{active ? <span>Evidence</span> : null}
              </a>
            );
          })}
          {revision.pages.length === 0 ? <p className="row-meta">No pages available.</p> : null}
        </nav>
        <div>
          <SourceDocument
            pages={revision.pages.map((page) => ({ id: page.id, pageNumber: page.pageNumber, text: page.text }))}
            target={target}
          />
          {revision.pages.length === 0 ? <div className="empty"><strong>Source text is unavailable</strong><span>Check the reading status above.</span></div> : null}
        </div>
      </div>
    </main>
  );
}
