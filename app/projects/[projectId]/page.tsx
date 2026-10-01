import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/lib/domain/errors";
import { getProject } from "@/lib/projects/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let project;
  try { project = await getProject(currentOrganizationId(), projectId); }
  catch (error) { if (error instanceof DomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  return (
    <main className="page">
      <nav className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><span>{project.name}</span></nav>
      <div className="page-heading">
        <div><p className="eyebrow">{project.projectNumber || "Project"}</p><h1>{project.name}</h1><p className="lede">Logical documents and their complete revision histories.</p></div>
        <details className="create-panel panel"><summary><Button asChild><span>Add document</span></Button></summary><CreateDocumentForm projectId={project.id} /></details>
      </div>
      <div className="section-heading"><h2>Documents</h2><span className="count">{project.documents.length} total</span></div>
      {project.documents.length ? <div className="list">{project.documents.map((document) => (
        <Link className="list-row" href={`/documents/${document.id}`} key={document.id}>
          <div><p className="row-title">{document.title}</p><p className="row-meta">{document.documentType || "Unclassified document"}</p></div>
          <div className="row-side"><span>{document.revisionCount} {document.revisionCount === 1 ? "revision" : "revisions"}</span><span aria-hidden>→</span></div>
        </Link>
      ))}</div> : <div className="empty">No documents yet. Add a logical document before uploading revisions.</div>}
    </main>
  );
}
