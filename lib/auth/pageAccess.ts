import { cookies, headers } from "next/headers";
import { forbidden, unauthorized } from "next/navigation";
import { isDomainError } from "@/lib/domain/errors";
import type { SessionLookup } from "./credentials";
import { authorizeRequest, type AccessRequest, type OrgAccess } from "./membership";
import { membershipStore } from "./prismaMembership";
import type { MembershipLookup, OrgPermission } from "./roles";

/** Headers and the session cookie seen by a server-rendered desk. */
export async function pageAccessRequest(): Promise<AccessRequest> {
  return { headers: await headers(), cookies: await cookies() };
}

/** Same OrgMembership gate as authorizeRequest, for server-rendered desks.
 *  The session cookie is the caller. A denied member becomes the 403 page.
 *  An unsigned page becomes the 401 page. The desk layout calls this before
 *  its loading boundary so the document status is 401 or 403. Pages call it
 *  again because a layout does not re-render on client navigations. The root
 *  layout cannot call forbidden(); it omits organization data instead.
 */
export async function authorizePage(
  permission: OrgPermission = "read",
  lookup: MembershipLookup = membershipStore,
  sessions: SessionLookup = membershipStore,
): Promise<OrgAccess> {
  try {
    return await authorizeRequest(await pageAccessRequest(), permission, lookup, sessions);
  } catch (error) {
    if (isDomainError(error) && error.code === "FORBIDDEN") forbidden();
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") unauthorized();
    throw error;
  }
}
