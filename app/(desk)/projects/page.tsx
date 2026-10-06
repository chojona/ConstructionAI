import { Plus } from "lucide-react";
import { CreateProjectForm } from "@/components/forms/create-project-form";
import { EmptySolidCard } from "@/components/workspace/empty-solid-card";
import { ProjectCard } from "@/components/workspace/project-card";
import { authorizePage } from "@/lib/auth/pageAccess";
import { listProjects } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { getProjectReview } from "@/lib/review/service";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { organizationId } = await authorizePage("read");
  const projects = await listProjects(organizationId);
  const rows = await Promise.all(projects.map(async (project) => {
    const review = await getProjectReview(organizationId, project.id);
    return { ...project, openCount: listAttention(review.findings).length };
  }));
  const needAttention = rows.filter((project) => project.openCount > 0).length;
  const openChanges = rows.reduce((sum, project) => sum + project.openCount, 0);
  const documents = rows.reduce((sum, project) => sum + project.documentCount, 0);
  return (
    <main className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Portfolio</p><h1>Projects</h1><p className="lede">Open a project to decide the changes that are still open.</p></div>
        <details className="create-panel panel" id="new-project">
          <summary className="primary-summary"><Plus size={14} aria-hidden />New project</summary>
          <CreateProjectForm />
        </details>
      </div>
      <dl className="metrics">
        <div className="metric">
          <dt>Active projects</dt>
          <dd className="metric-value">{rows.length}</dd>
          <dd className={`metric-note ${needAttention ? "metric-note-attention" : "metric-note-success"}`}>{needAttention ? `${needAttention} need attention` : "All clear"}</dd>
        </div>
        <div className="metric">
          <dt>Open changes</dt>
          <dd className="metric-value">{openChanges}</dd>
          <dd className={`metric-note ${openChanges ? "metric-note-attention" : "metric-note-success"}`}>{openChanges ? `Across ${needAttention} ${needAttention === 1 ? "project" : "projects"}` : "Nothing waiting on a decision"}</dd>
        </div>
        <div className="metric">
          <dt>Documents</dt>
          <dd className="metric-value">{documents}</dd>
          <dd className="metric-note metric-note-success">{`In ${rows.length} ${rows.length === 1 ? "project" : "projects"}`}</dd>
        </div>
      </dl>
      <div className="section-heading"><h2>Active projects</h2><span className="count">Sorted by attention</span></div>
      {rows.length ? (
        <div className="list project-list">
          <div className="project-table-head" aria-hidden><span>Project</span><span>Project no.</span><span>Documents</span><span>Status</span></div>
          {rows.sort((a, b) => b.openCount - a.openCount).map((project) => (
            <ProjectCard key={project.id} href={`/projects/${project.id}`} name={project.name} projectNumber={project.projectNumber} documentCount={project.documentCount} openCount={project.openCount} />
          ))}
        </div>
      ) : <EmptySolidCard message="No projects yet" action={{ href: "#new-project", label: "New project" }} />}
    </main>
  );
}
