import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { FindingReviewList } from "@/components/forms/finding-review-list";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/lib/domain/errors";
import { getProject } from "@/lib/projects/service";
import { toFindingDto } from "@/lib/review/dto";
import { getProjectReview } from "@/lib/review/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";
const dateTime = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(value);

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const organizationId = currentOrganizationId();
  let project;
  let review;
  try {
    project = await getProject(organizationId, projectId);
    review = await getProjectReview(organizationId, projectId);
  }
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
      <section className="review-block">
        <div className="section-heading"><h2>Effective project state</h2><span className="count">{review.state.facts.length} accepted</span></div>
        <p className="field-help">Accepted findings are projected here. Source revisions and extraction runs stay unchanged.</p>
        {review.state.facts.length ? <div className="list">{review.state.facts.map((fact) => (
          <div className="list-row" key={fact.proposedFactId}>
            <div>
              <p className="row-title">{fact.summary}</p>
              <p className="row-meta">{fact.documentTitle} · {fact.revisionLabel} · accepted by {fact.reviewerId} on {dateTime(fact.acceptedAt)}</p>
              {fact.supersedesProposedFactId && <p className="row-meta">Supersedes {review.state.retirements.find((retirement) => retirement.proposedFactId === fact.supersedesProposedFactId)?.summary ?? "an earlier accepted fact"}</p>}
            </div>
          </div>
        ))}</div> : <div className="empty">No accepted facts yet.</div>}
        {review.state.retirements.length > 0 && <div className="retired">{review.state.retirements.map((retirement) => (
          <p key={`${retirement.proposedFactId}-${retirement.decisionId}`}>{retirement.supersededByProposedFactId ? `“${retirement.summary}” was superseded. Recorded by ${retirement.reviewerId}.` : `“${retirement.summary}” was removed from the current projection by ${retirement.reviewerId}.`}</p>
        ))}</div>}
      </section>
      <section className="review-block">
        <div className="section-heading"><h2>Findings</h2><span className="count">{review.findings.length} total</span></div>
        <FindingReviewList projectId={project.id} findings={review.findings.map(toFindingDto)} />
      </section>
    </main>
  );
}
