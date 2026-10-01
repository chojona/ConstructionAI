import Link from "next/link";
import { ProjectNavigation } from "@/components/workspace/project-navigation";
import { notFound } from "next/navigation";
import { SourceDocument } from "@/components/review/source-document";
import { Badge } from "@/components/ui/badge";
import { getRevision } from "@/lib/documents/service";
import { DomainError } from "@/lib/domain/errors";
import { parseEvidenceTarget, safeReturnPath } from "@/lib/review/evidenceLocation";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";
const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

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
  let revision;
  try { revision = await getRevision(currentOrganizationId(), revisionId); }
  catch (error) { if (error instanceof DomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  return (
    <main className="page reading">
      <nav className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><Link href={`/projects/${revision.document.project.id}`}>{revision.document.project.name}</Link><span>/</span><Link href={`/documents/${revision.document.id}`}>{revision.document.title}</Link><span>/</span><span>{revision.revisionLabel}</span></nav>
      <p className="eyebrow">{revision.document.title}</p>
      <h1>{revision.revisionLabel}</h1>
      <p className="lede">Source inspection · {revision.document.title}</p>
      <div className="review-block"><ProjectNavigation projectId={revision.document.project.id} active="documents" /></div>
      <div className="facts">
        <dl className="fact"><dt>Status</dt><dd><Badge className={revision.status === "PROCESSED" ? "status-processed" : revision.status === "FAILED" ? "status-failed" : "status-pending"}>{revision.status}</Badge></dd></dl>
        <dl className="fact"><dt>Pages</dt><dd>{revision.pages.length}</dd></dl>
        <dl className="fact"><dt>Uploaded</dt><dd>{date(revision.createdAt)}</dd></dl>
        <dl className="fact"><dt>File</dt><dd>{revision.originalFilename}</dd></dl>
      </div>
      {revision.failureMessage && <p className="failure"><strong>{revision.failureCode}:</strong> {revision.failureMessage}</p>}
      <div className="source-heading-row">
        <h2 className="source-heading">Source</h2>
        {returnTo && <Link className="return-link" href={returnTo}>Back to decision</Link>}
      </div>
      <div className="revision-layout"><nav className="revision-index" aria-label="Source pages"><h2>Pages</h2>{revision.pages.map((page) => <a key={page.id} href={target?.pageId === page.id ? "#evidence" : `#page-${page.id}`} className={target?.pageId === page.id ? "is-active" : ""}>Page {page.pageNumber}{target?.pageId === page.id && <span>Evidence</span>}</a>)}{!revision.pages.length && <p className="row-meta">No pages available.</p>}</nav><div>
      <SourceDocument pages={revision.pages.map((page) => ({ id: page.id, pageNumber: page.pageNumber, text: page.text }))} target={target} />
      {!revision.pages.length && <div className="empty">Source text is unavailable. Check the processing status above.</div>}
      </div></div>
    </main>
  );
}
