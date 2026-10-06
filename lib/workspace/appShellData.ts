import { pageAccessRequest } from "@/lib/auth/pageAccess";
import { authorizeRequest } from "@/lib/auth/membership";
import { roleAllows } from "@/lib/auth/roles";
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

/** Projects for the workspace shell. A denied or unsigned caller gets no
 *  organization rows. forbidden() cannot run in the root layout, so the page
 *  gate renders the 403 or the 401 sign-in page.
 */
export async function loadAppShell(): Promise<{ projects: ShellProject[]; signedIn: boolean; canManagePeople: boolean }> {
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
    return { projects: cards, signedIn: true, canManagePeople: roleAllows(access.role, "manage_people") };
  } catch (error) {
    if (isDomainError(error) && (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")) {
      return { projects: [], signedIn: false, canManagePeople: false };
    }
    throw error;
  }
}
