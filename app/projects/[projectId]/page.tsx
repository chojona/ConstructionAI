import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeReview } from "@/components/review/change-review";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { ScrollToFinding } from "@/components/review/scroll-to-finding";
import { ProjectContext } from "@/components/workspace/project-context";
import { ProjectNavigation } from "@/components/workspace/project-navigation";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { DomainError } from "@/lib/domain/errors";
import { getProject } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { uploadRevisionHref } from "@/lib/review/emptyState";
import { toAttentionDto } from "@/lib/review/dto";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";
import { getProjectReview } from "@/lib/review/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";
const dateTime = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(value);

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string }> }) {
  const { view: requestedView } = await searchParams;
  const view = requestedView === "changes" || requestedView === "documents" ? requestedView : "overview";
  const { projectId } = await params;
  const organizationId = currentOrganizationId();
  let project;
  let review;
  try {
    project = await getProject(organizationId, projectId);
    review = await getProjectReview(organizationId, projectId);
  }
  catch (error) { if (error instanceof DomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  const attention = listAttention(review.findings);
  return (
    <main className="page">
      <ScrollToFinding />
      <ProjectContext projectId={project.id}><Link href="/projects">Projects</Link><span>/</span><span>{project.name}</span></ProjectContext>
      <div className="page-heading">
        <div><p className="eyebrow">{project.projectNumber?.trim() || "No project number"}</p><h1>{project.name}</h1><p className="lede">Review source changes, resolve exceptions, and keep the project moving.</p></div>
        <details className="create-panel panel" id="add-document" open={view === "documents" && project.documents.length === 0}><summary className="primary-summary">Add document</summary><CreateDocumentForm projectId={project.id} /></details>
      </div>
      <ProjectNavigation projectId={project.id} active={view} openCount={attention.length} />
      {view !== "documents" && <section>
        <div className="section-heading"><h2>Changes <span className="heading-sub">Needs attention</span></h2><span className="count">{attention.length} open</span></div>
        <ChangeReview projectId={project.id} items={attention.map(toAttentionDto)} uploadHref={uploadRevisionHref(project.id, project.documents)} />
      </section>}
      {view !== "changes" && <section className="review-block">
        <div className="section-heading"><h2>Documents</h2><span className="count">{project.documents.length} total</span></div>
        {project.documents.length ? <div className="list">{project.documents.map((document) => (
          <Link className="list-row" href={`/documents/${document.id}`} key={document.id}>
            <div><p className="row-title">{document.title}</p><p className="row-meta">{document.documentType || "Unclassified document"}</p></div>
            <div className="row-side"><span>{document.revisionCount} {document.revisionCount === 1 ? "revision" : "revisions"}</span></div>
          </Link>
        ))}</div> : <div className="empty"><strong>No documents yet</strong><span>Add a document before uploading revisions.</span></div>}
      </section>}
      {view === "overview" && <section className="review-block">
        <div className="section-heading"><h2>Current project values</h2><span className="count">{review.state.facts.length} accepted</span></div>
        <p className="field-help">Current facts accepted by your team, with the evidence behind each decision.</p>
        {review.state.facts.length ? <div className="list">{review.state.facts.map((fact) => (
          <div className="list-row" id={findingDomId(fact.proposedFactId)} key={fact.proposedFactId}>
            <div>
              <p className="row-title">{fact.summary}</p>
                            <p className="row-meta">{fact.documentTitle} · {fact.revisionLabel} · accepted by {fact.reviewerId} on {dateTime(fact.acceptedAt)}</p>
              <EvidenceQuotes
                items={fact.evidence.map((item) => ({ ...item, revisionId: fact.documentRevisionId, revisionLabel: fact.revisionLabel, documentTitle: fact.documentTitle }))}
                returnTo={decisionReturnPath(project.id, fact.proposedFactId)}
              />
              {fact.supersedesProposedFactId && <p className="row-meta">Replaces {review.state.retirements.find((retirement) => retirement.proposedFactId === fact.supersedesProposedFactId)?.summary ?? "an earlier accepted value"}</p>}
            </div>
          </div>
        ))}</div> : <div className="empty"><strong>No accepted values yet</strong><span>Accepted facts show up here after a decision is recorded.</span></div>}
        {review.state.retirements.length > 0 && <div className="retired">{review.state.retirements.map((retirement) => (
          <p key={`${retirement.proposedFactId}-${retirement.decisionId}`}>{retirement.supersededByProposedFactId ? `“${retirement.summary}” was replaced. Recorded by ${retirement.reviewerId}.` : `“${retirement.summary}” was removed from the current values by ${retirement.reviewerId}.`}</p>
        ))}</div>}
      </section>}
    </main>
  );
}
