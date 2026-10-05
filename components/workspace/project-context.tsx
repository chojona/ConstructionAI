import { authorizePage } from "@/lib/auth/pageAccess";
import { listProjects } from "@/lib/projects/service";
import { ProjectSwitcher } from "./project-switcher";

export async function ProjectContext({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const { organizationId } = await authorizePage("read");
  const projects = await listProjects(organizationId);
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
