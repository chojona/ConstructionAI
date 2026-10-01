import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getRevision } from "@/lib/documents/service";
import { DomainError } from "@/lib/domain/errors";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";
const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

export default async function RevisionPage({ params }: { params: Promise<{ revisionId: string }> }) {
  const { revisionId } = await params;
  let revision;
  try { revision = await getRevision(currentOrganizationId(), revisionId); }
  catch (error) { if (error instanceof DomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  return (
    <main className="page reading">
      <nav className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><Link href={`/projects/${revision.document.project.id}`}>{revision.document.project.name}</Link><span>/</span><Link href={`/documents/${revision.document.id}`}>{revision.document.title}</Link><span>/</span><span>{revision.revisionLabel}</span></nav>
      <p className="eyebrow">{revision.document.title}</p>
      <h1>{revision.revisionLabel}</h1>
      <div className="facts">
        <dl className="fact"><dt>Status</dt><dd><Badge className={revision.status === "PROCESSED" ? "status-processed" : revision.status === "FAILED" ? "status-failed" : "status-pending"}>{revision.status}</Badge></dd></dl>
        <dl className="fact"><dt>Pages</dt><dd>{revision.pages.length}</dd></dl>
        <dl className="fact"><dt>Uploaded</dt><dd>{date(revision.createdAt)}</dd></dl>
        <dl className="fact"><dt>File</dt><dd>{revision.originalFilename}</dd></dl>
      </div>
      {revision.failureMessage && <p className="failure"><strong>{revision.failureCode}:</strong> {revision.failureMessage}</p>}
      <h2 className="source-heading">Source</h2>
      {revision.pages.map((page) => <section className="page-source" key={page.id}><h2>Page {page.pageNumber}</h2><pre>{page.text || "No embedded text found on this page."}</pre></section>)}
    </main>
  );
}
