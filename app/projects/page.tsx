import Link from "next/link";
import { CreateProjectForm } from "@/components/forms/create-project-form";
import { Button } from "@/components/ui/button";
import { listProjects } from "@/lib/projects/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects(currentOrganizationId());
  return (
    <main className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Portfolio</p><h1>Projects</h1><p className="lede">Construction documents organized by project and revision.</p></div>
        <details className="create-panel panel">
          <summary><Button asChild><span>New project</span></Button></summary>
          <CreateProjectForm />
        </details>
      </div>
      <div className="section-heading"><h2>Active projects</h2><span className="count">{projects.length} total</span></div>
      {projects.length ? (
        <div className="list">
          {projects.map((project) => (
            <Link className="list-row" href={`/projects/${project.id}`} key={project.id}>
              <div><p className="row-title">{project.name}</p><p className="row-meta">{project.projectNumber || "No project number"}</p></div>
              <div className="row-side"><span>{project.documentCount} {project.documentCount === 1 ? "document" : "documents"}</span><span aria-hidden>→</span></div>
            </Link>
          ))}
        </div>
      ) : <div className="empty">No projects yet. Create the first project to begin.</div>}
    </main>
  );
}
