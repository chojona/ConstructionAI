import Link from "next/link";
import { notFound } from "next/navigation";
import { HeavyJobSourceBrowser } from "@/components/heavyjob/source-object-browser";
import { ChangeReview } from "@/components/review/change-review";
import { ScrollToFinding } from "@/components/review/scroll-to-finding";
import { DocumentsDesk } from "@/components/workspace/documents-desk";
import { ProjectContext } from "@/components/workspace/project-context";
import { parseProjectView, ProjectNavigation } from "@/components/workspace/project-navigation";
import { CreateDocumentForm } from "@/components/forms/create-document-form";
import { DomainError } from "@/lib/domain/errors";
import { toHeavyJobSourceObjectDto } from "@/lib/heavyjob/dto";
import { listHeavyJobSourceObjects } from "@/lib/heavyjob/service";
import { getProject } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { decidedRowChrome } from "@/lib/review/changeRow";
import { approvedChangePreview } from "@/lib/review/exportPacket";
import { deskPackFiles, EXPORT_BLOCKED_MESSAGE, isLegacyPageCiteError } from "@/lib/review/exportPacketView";
import { uploadRevisionHref } from "@/lib/review/emptyState";
import { toAttentionDto } from "@/lib/review/dto";
import { authorizePage } from "@/lib/auth/pageAccess";
import { currentApprovedChangePacket, getProjectReview } from "@/lib/review/service";

export const dynamic = "force-dynamic";

async function loadPackFiles(organizationId: string, projectId: string) {
  try {
    const packet = await currentApprovedChangePacket(organizationId, projectId);
    return {
      chapters: deskPackFiles(packet.chapters),
      appendices: deskPackFiles(packet.appendices),
      citeNotice: null,
    };
  } catch (error) {
    if (error instanceof DomainError && error.message === EXPORT_BLOCKED_MESSAGE) {
      return { chapters: [], appendices: [], citeNotice: null };
    }
    if (isLegacyPageCiteError(error)) {
      return { chapters: [], appendices: [], citeNotice: error.message };
    }
    throw error;
  }
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string }> }) {
  const { view: requestedView } = await searchParams;
  const view = parseProjectView(requestedView);
  const { projectId } = await params;
  const { organizationId } = await authorizePage("read");
  let project;
  let review;
  try {
    project = await getProject(organizationId, projectId);
    review = await getProjectReview(organizationId, projectId);
  }
  catch (error) { if (error instanceof DomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  const attention = listAttention(review.findings);
  const approved = approvedChangePreview(review.findings);
  const packFiles = approved.length > 0 ? await loadPackFiles(organizationId, projectId) : { chapters: [], appendices: [], citeNotice: null };
  const heavyJobObjects = view === "heavyjob"
    ? (await listHeavyJobSourceObjects(organizationId, projectId)).map(toHeavyJobSourceObjectDto)
    : [];
  return (
    <main className={view === "documents" ? "page page-documents" : "page"}>
      <ScrollToFinding />
      <ProjectContext projectId={project.id}><Link href="/projects">Projects</Link><span>/</span><span>{project.name}</span></ProjectContext>
      <div className="page-heading">
        <div><p className="eyebrow">{project.projectNumber?.trim() || "No project number"}</p><h1>{project.name}</h1><p className="lede">{view === "heavyjob" ? "Stored HeavyJob snapshots for this project." : "Review source changes, resolve exceptions, and keep the project moving."}</p></div>
        {view !== "heavyjob" && <details className="create-panel panel" id="add-document"><summary className="primary-summary">Add document</summary><CreateDocumentForm projectId={project.id} /></details>}
      </div>
      <ProjectNavigation projectId={project.id} active={view} openCount={attention.length} />
      {view !== "documents" && view !== "heavyjob" && <section>
        <div className="section-heading"><h2>Changes <span className="heading-sub">Needs attention</span></h2><span className="count">{attention.length} open</span></div>
        <ChangeReview
          projectId={project.id}
          items={attention.map(toAttentionDto)}
          approved={approved}
          decided={decidedRowChrome(review.findings)}
          chapters={packFiles.chapters}
          appendices={packFiles.appendices}
          citeNotice={packFiles.citeNotice}
          notes={review.state.retirements.map((retirement) => ({
            key: `${retirement.proposedFactId}-${retirement.decisionId}`,
            text: retirement.supersededByProposedFactId
              ? `“${retirement.summary}” was replaced. Recorded by ${retirement.reviewerId}.`
              : `“${retirement.summary}” was removed from the current values by ${retirement.reviewerId}.`,
          }))}
          uploadHref={uploadRevisionHref(project.id, project.documents)}
        />
      </section>}
      {view !== "changes" && view !== "heavyjob" && <section className="review-block">
        <div className="section-heading"><h2>Documents</h2><span className="count">{project.documents.length} total</span></div>
        <DocumentsDesk documents={project.documents} />
      </section>}
      {view === "heavyjob" && <HeavyJobSourceBrowser objects={heavyJobObjects} />}
    </main>
  );
}
