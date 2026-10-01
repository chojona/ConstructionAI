import Link from "next/link";
import { notFound } from "next/navigation";
import { UploadRevisionForm } from "@/components/forms/upload-revision-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDocument } from "@/lib/documents/service";
import { DomainError } from "@/lib/domain/errors";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";
const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

export default async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  let document;
  try { document = await getDocument(currentOrganizationId(), documentId); }
  catch (error) { if (error instanceof DomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  return (
    <main className="page">
      <nav className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><Link href={`/projects/${document.project.id}`}>{document.project.name}</Link><span>/</span><span>{document.title}</span></nav>
      <div className="page-heading">
        <div><p className="eyebrow">{document.documentType || "Document"}</p><h1>{document.title}</h1><p className="lede">Each upload is preserved as an immutable revision.</p></div>
        <details className="create-panel panel"><summary><Button asChild><span>Upload revision</span></Button></summary><UploadRevisionForm documentId={document.id} /></details>
      </div>
      <div className="section-heading"><h2>Revision history</h2><span className="count">{document.revisions.length} total</span></div>
      {document.revisions.length ? <div className="list">{document.revisions.map((revision) => (
        <Link className="list-row" href={`/revisions/${revision.id}`} key={revision.id}>
          <div><p className="row-title">{revision.revisionLabel}</p><p className="row-meta">Uploaded {date(revision.createdAt)} · {revision.originalFilename}</p></div>
          <div className="row-side"><Badge className={revision.status === "PROCESSED" ? "status-processed" : revision.status === "FAILED" ? "status-failed" : "status-pending"}>{revision.status}</Badge><span aria-hidden>→</span></div>
        </Link>
      ))}</div> : <div className="empty">No revisions yet. Upload the first source PDF.</div>}
    </main>
  );
}
