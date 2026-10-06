import { pageAccessRequest } from "@/lib/auth/pageAccess";
import { authorizeRequest } from "@/lib/auth/membership";
import { roleAllows } from "@/lib/auth/roles";
import { currentSessionViewer, type SessionViewer } from "@/lib/auth/sessionViewer";
import { isDomainError } from "@/lib/domain/errors";
import { listProjects } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { getProjectReview } from "@/lib/review/service";

export interface ShellProject {
  id: string;
  name: string;
  projectNumber: string | null;
  documentCount: number;
  openCount: number;
}

/** Projects and the signed-in member for the workspace shell. A denied or
 *  unsigned caller gets no organization rows. The member comes from the
 *  session cookie, not x-user-id. forbidden() cannot run in the root layout,
 *  so the page gate renders the 403 or the 401 sign-in page.
 */
export async function loadAppShell(): Promise<{
  projects: ShellProject[];
  viewer: SessionViewer | null;
  canManagePeople: boolean;
}> {
  const viewer = await currentSessionViewer();
  try {
    const access = await authorizeRequest(await pageAccessRequest(), "read");
    const projects = await listProjects(access.organizationId);
    const cards = await Promise.all(projects.map(async (project) => {
      const review = await getProjectReview(access.organizationId, project.id);
      return {
        id: project.id,
        name: project.name,
        projectNumber: project.projectNumber,
        documentCount: project.documentCount,
        openCount: listAttention(review.findings).length,
      };
    }));
    return { projects: cards, viewer, canManagePeople: roleAllows(access.role, "manage_people") };
  } catch (error) {
    if (isDomainError(error) && (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")) {
      return { projects: [], viewer, canManagePeople: false };
    }
    throw error;
  }
}
