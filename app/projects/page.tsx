import { Plus } from "lucide-react";
import { CreateProjectForm } from "@/components/forms/create-project-form";
import { EmptySolidCard } from "@/components/workspace/empty-solid-card";
import { ProjectCard } from "@/components/workspace/project-card";
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
        <details className="create-panel panel" id="new-project">
          <summary className="primary-summary"><Plus size={14} aria-hidden />New project</summary>
          <CreateProjectForm />
        </details>
      </div>
      <div className="section-heading"><h2>Active projects</h2><span className="count">{rows.length} total</span></div>
      {rows.length ? (
        <div className="list project-list">
          {rows.sort((a, b) => b.openCount - a.openCount).map((project) => (
            <ProjectCard key={project.id} href={`/projects/${project.id}`} name={project.name} projectNumber={project.projectNumber} documentCount={project.documentCount} openCount={project.openCount} />
          ))}
        </div>
      ) : <EmptySolidCard message="No projects yet" action={{ href: "#new-project", label: "New project" }} />}
    </main>
  );
}
