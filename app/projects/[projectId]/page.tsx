import Link from "next/link";
import { notFound } from "next/navigation";
import { AttentionFeed } from "@/components/forms/attention-feed";
import { EvidenceQuotes } from "@/components/review/evidence-quotes";
import { ScrollToFinding } from "@/components/review/scroll-to-finding";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/lib/domain/errors";
import { getProject } from "@/lib/projects/service";
import { listAttention, listSettled } from "@/lib/review/attention";
import { toAttentionDto } from "@/lib/review/dto";
import { decisionReturnPath, findingDomId } from "@/lib/review/evidenceLocation";
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
  const attention = listAttention(review.findings);
  const settled = listSettled(review.findings);
  return (
    <main className="page">
      <ScrollToFinding />
      <nav className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><span>{project.name}</span></nav>
      <div className="page-heading">
        <div><p className="eyebrow">{project.projectNumber || "Project"}</p><h1>{project.name}</h1><p className="lede">Decide what changed, then move to the next item.</p></div>
        <details className="create-panel panel"><summary><Button asChild><span>Add document</span></Button></summary><CreateDocumentForm projectId={project.id} /></details>
      </div>
      <section>
        <div className="section-heading"><h2>Needs a decision</h2><span className="count">{attention.length} open</span></div>
        <AttentionFeed projectId={project.id} items={attention.map(toAttentionDto)} />
      </section>
      <section className="review-block">
        <div className="section-heading"><h2>Documents</h2><span className="count">{project.documents.length} total</span></div>
        {project.documents.length ? <div className="list">{project.documents.map((document) => (
          <Link className="list-row" href={`/documents/${document.id}`} key={document.id}>
            <div><p className="row-title">{document.title}</p><p className="row-meta">{document.documentType || "Unclassified document"}</p></div>
            <div className="row-side"><span>{document.revisionCount} {document.revisionCount === 1 ? "revision" : "revisions"}</span><span aria-hidden>→</span></div>
          </Link>
        ))}</div> : <div className="empty">No documents yet. Add a document before uploading revisions.</div>}
      </section>
      <section className="review-block">
        <div className="section-heading"><h2>Current project values</h2><span className="count">{review.state.facts.length} accepted</span></div>
        <p className="field-help">These are the values in use after review.</p>
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
        ))}</div> : <div className="empty">Nothing accepted yet.</div>}
        {review.state.retirements.length > 0 && <div className="retired">{review.state.retirements.map((retirement) => (
          <p key={`${retirement.proposedFactId}-${retirement.decisionId}`}>{retirement.supersededByProposedFactId ? `“${retirement.summary}” was replaced. Recorded by ${retirement.reviewerId}.` : `“${retirement.summary}” was removed from the current values by ${retirement.reviewerId}.`}</p>
        ))}</div>}
      </section>
      {settled.length > 0 && <section className="review-block">
        <details className="settled-fold">
        <summary className="section-heading"><h2>Settled and wording-only</h2><span className="count">{settled.length}</span></summary>
        <div className="list">{settled.map((finding) => (
          <div className="list-row" id={findingDomId(finding.subjectKey)} key={finding.subjectKey}>
            <div>
              <p className="row-title">{finding.label}</p>
              <p className="row-meta">{finding.documentTitle} · {finding.revisionLabel} · {settledStatus(finding)}</p>
              <EvidenceQuotes
                items={[...(finding.before?.evidence ?? []), ...(finding.after?.evidence ?? [])]}
                returnTo={decisionReturnPath(project.id, finding.subjectKey)}
              />
            </div>
          </div>
        ))}</div>
        </details>
      </section>}
    </main>
  );
}

function settledStatus(finding: { material: boolean | null; currentDecision: { decision: string; reviewerId: string } | null }) {
  if (finding.currentDecision) return `${finding.currentDecision.decision.toLowerCase()} by ${finding.currentDecision.reviewerId}`;
  if (finding.material === false) return "wording only, no decision required";
  return "recorded";
}
