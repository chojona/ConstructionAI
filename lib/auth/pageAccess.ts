import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
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
 *  An unsigned page goes to /login. The root layout cannot call forbidden();
 *  it uses authorizeRequest and omits organization data instead.
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
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect("/login");
    throw error;
  }
}
