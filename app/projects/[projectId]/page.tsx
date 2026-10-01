import Link from "next/link";
import { notFound } from "next/navigation";
import { AttentionFeed } from "@/components/forms/attention-feed";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { ScrollToFinding } from "@/components/review/scroll-to-finding";
import { ProjectNavigation } from "@/components/workspace/project-navigation";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/lib/domain/errors";
import { getProject } from "@/lib/projects/service";
import { listAttention, listSettled } from "@/lib/review/attention";
import { toAttentionDto, toFindingDto } from "@/lib/review/dto";
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
  const settled = listSettled(review.findings);
  return (
    <main className="page">
      <ScrollToFinding />
      <nav className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><span>{project.name}</span></nav>
      <div className="page-heading">
        <div><p className="eyebrow">{project.projectNumber || "Project"}</p><h1>{project.name}</h1><p className="lede">Review source changes, resolve exceptions, and keep the project moving.</p></div>
        <details className="create-panel panel"><summary><Button asChild><span>Add document</span></Button></summary><CreateDocumentForm projectId={project.id} /></details>
      </div>
      <ProjectNavigation projectId={project.id} active={view} openCount={attention.length} />
      {view !== "documents" && <section>
        <div className="section-heading"><h2>Needs a decision</h2><span className="count">{attention.length} open</span></div>
        <AttentionFeed projectId={project.id} items={attention.map(toAttentionDto)} settled={settled.map(toFindingDto)} />
      </section>}
      {view !== "changes" && <section className="review-block">
        <div className="section-heading"><h2>Documents</h2><span className="count">{project.documents.length} total</span></div>
        {project.documents.length ? <div className="list">{project.documents.map((document) => (
          <Link className="list-row" href={`/documents/${document.id}`} key={document.id}>
            <div><p className="row-title">{document.title}</p><p className="row-meta">{document.documentType || "Unclassified document"}</p></div>
            <div className="row-side"><span>{document.revisionCount} {document.revisionCount === 1 ? "revision" : "revisions"}</span><span aria-hidden>→</span></div>
          </Link>
        ))}</div> : <div className="empty">No documents yet. Add a logical document before uploading revisions.</div>}
      </section>}
      {view === "overview" && <section className="review-block">
        <div className="section-heading"><h2>Accepted project state</h2><span className="count">{review.state.facts.length} accepted</span></div>
        <p className="field-help">Current facts accepted by your team, with the evidence behind each decision.</p>
        {review.state.facts.length ? <div className="list">{review.state.facts.map((fact) => (
          <div className="list-row" id={findingDomId(fact.proposedFactId)} key={fact.proposedFactId}>
            <div>
              <p className="row-title">{fact.summary}</p>
              <p className="evidence-kicker">Reading</p>
              <p className="row-meta">{fact.documentTitle} · {fact.revisionLabel} · accepted by {fact.reviewerId} on {dateTime(fact.acceptedAt)}</p>
              <EvidenceQuotes
                items={fact.evidence.map((item) => ({ ...item, revisionId: fact.documentRevisionId, revisionLabel: fact.revisionLabel, documentTitle: fact.documentTitle }))}
                returnTo={decisionReturnPath(project.id, fact.proposedFactId)}
              />
              {fact.supersedesProposedFactId && <p className="row-meta">Supersedes {review.state.retirements.find((retirement) => retirement.proposedFactId === fact.supersedesProposedFactId)?.summary ?? "an earlier accepted fact"}</p>}
            </div>
          </div>
        ))}</div> : <div className="empty">No accepted facts yet.</div>}
        {review.state.retirements.length > 0 && <div className="retired">{review.state.retirements.map((retirement) => (
          <p key={`${retirement.proposedFactId}-${retirement.decisionId}`}>{retirement.supersededByProposedFactId ? `“${retirement.summary}” was superseded. Recorded by ${retirement.reviewerId}.` : `“${retirement.summary}” was removed from the current projection by ${retirement.reviewerId}.`}</p>
        ))}</div>}
      </section>}
    </main>
  );
}
