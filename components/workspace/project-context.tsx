import { listProjects } from "@/lib/projects/service";
import { currentOrganizationId } from "@/lib/tenancy";
import { ProjectSwitcher } from "./project-switcher";

export async function ProjectContext({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const projects = await listProjects(currentOrganizationId());
  return (
    <div className="project-context">
      <nav className="breadcrumb">{children}</nav>
      <ProjectSwitcher
        currentId={projectId}
        projects={projects.map(({ id, name, projectNumber }) => ({ id, name, projectNumber }))}
      />
    </div>
  );
}
