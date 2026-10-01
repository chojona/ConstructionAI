import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { CreateProjectForm } from "@/components/forms/create-project-form";
import { Button } from "@/components/ui/button";
import { listProjects } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { getProjectReview } from "@/lib/review/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const organizationId = currentOrganizationId();
  const projects = await listProjects(organizationId);
  const rows = await Promise.all(projects.map(async (project) => {
    const review = await getProjectReview(organizationId, project.id);
    return { ...project, openCount: listAttention(review.findings).length };
  }));
  return (
    <main className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Portfolio</p><h1>Projects</h1><p className="lede">Open a project to decide the changes that are still open.</p></div>
        <details className="create-panel panel">
          <summary><Button asChild><span><Plus size={14} aria-hidden />New project</span></Button></summary>
          <CreateProjectForm />
        </details>
      </div>
      <div className="section-heading"><h2>Active projects</h2><span className="count">{rows.length} total</span></div>
      {rows.length ? (
        <div className="list">
          {rows.sort((a, b) => b.openCount - a.openCount).map((project) => (
            <Link className="list-row" href={`/projects/${project.id}`} key={project.id}>
              <div className="project-row-name"><span className="project-row-icon"><FolderKanban size={16} aria-hidden /></span><div><p className="row-title">{project.name}</p><p className="row-meta">{project.projectNumber || "No project number"}</p></div></div>
              <div className="row-side">
                <span className={project.openCount ? "open-count" : "clear-count"}>{project.openCount ? `${project.openCount} need a decision` : "All clear"}</span>
                <span>{project.documentCount} {project.documentCount === 1 ? "document" : "documents"}</span>
                <span aria-hidden>→</span>
              </div>
            </Link>
          ))}
        </div>
      ) : <div className="empty">No projects yet. Create the first project to begin.</div>}
    </main>
  );
}
