import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionHistory } from "@/components/documents/revision-history";
import { ProjectContext } from "@/components/workspace/project-context";
import { ProjectNavigation } from "@/components/workspace/project-navigation";
import { UploadRevisionForm } from "@/components/forms/upload-revision-form";
import { documentIdentity } from "@/lib/documents/documentDesk";
import { documentRegisterStatus, latestRevision, registerStatusClass } from "@/lib/documents/documentRegister";
import { getDocument } from "@/lib/documents/service";
import { describeReading } from "@/lib/documents/revisionExperience";
import { DomainError } from "@/lib/domain/errors";
import { authorizePage } from "@/lib/auth/pageAccess";
import { getProjectReview } from "@/lib/review/service";

export const dynamic = "force-dynamic";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(value);

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ upload?: string }>;
}) {
  const { documentId } = await params;
  const { upload } = await searchParams;
  const { organizationId } = await authorizePage("read");
  let document;
  try {
    document = await getDocument(organizationId, documentId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  let findings: Awaited<ReturnType<typeof getProjectReview>>["findings"] = [];
  try {
    const review = await getProjectReview(organizationId, document.project.id);
    const revisionIds = new Set(document.revisions.map((revision) => revision.id));
    findings = review.findings.filter((finding) => (
      finding.sources.some((source) => revisionIds.has(source.revisionId))
      || (finding.subject.type === "revision_change" && revisionIds.has(finding.subject.revisedRevisionId))
    ));
  } catch (error) {
    if (!(error instanceof DomainError && error.code === "NOT_FOUND")) throw error;
  }

  const latest = latestRevision(document.revisions);
  const status = latest ? documentRegisterStatus(true, latest.status) : null;
  const reading = latest && status ? describeReading(latest.status, latest.failureCode, latest.failureMessage, true) : null;
  const statusNote = status === "Failed" || status === "Processing" ? reading?.summary : null;
  const identity = documentIdentity(document.documentType, document.project.name);

  return (
    <main className="page">
      <ProjectContext projectId={document.project.id}>
        <Link href="/projects">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${document.project.id}`}>{document.project.name}</Link>
        <span>/</span>
        <span>{document.title}</span>
      </ProjectContext>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{identity}</p>
          <h1>{document.title}</h1>
          <p className="lede">
            {document.revisions.length === 0
              ? "Upload a PDF to start the revision history."
              : `${document.revisions.length} ${document.revisions.length === 1 ? "revision" : "revisions"} kept, newest first.`}
            {latest && status ? ` ${latest.revisionLabel} is ${status}, uploaded ${date(latest.createdAt)}.` : ""}
          </p>
        </div>
        <details className="create-panel panel" id="upload" open={upload === "1"}>
          <summary className="primary-summary">Upload revision</summary>
          <UploadRevisionForm documentId={document.id} />
        </details>
      </div>
      <ProjectNavigation projectId={document.project.id} active="documents" />
      {latest ? (
        <section className="document-context">
          <div>
            {status ? <span className={`status-label ${registerStatusClass(status)}`}>{status}</span> : null}
            <h2>{latest.revisionLabel}</h2>
            <p>{latest.originalFilename} · Uploaded {date(latest.createdAt)}</p>
            {statusNote ? <p className="status-note">{statusNote}</p> : null}
          </div>
          <Link href={`/projects/${document.project.id}?view=changes`}>Review project changes</Link>
        </section>
      ) : null}
      <section aria-labelledby="history-heading">
        <div className="section-heading">
          <h2 id="history-heading">Revision history</h2>
          <span className="count">{document.revisions.length} total</span>
        </div>
        <RevisionHistory revisions={document.revisions} findings={findings} />
      </section>
    </main>
  );
}
