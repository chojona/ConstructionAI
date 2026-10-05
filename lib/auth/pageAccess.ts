import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import { isDomainError } from "@/lib/domain/errors";
import { authorizeRequest, type OrgAccess } from "./membership";
import { membershipStore } from "./prismaMembership";
import type { MembershipLookup, OrgPermission } from "./roles";

/** Same OrgMembership gate as authorizeRequest, for server-rendered desks.
 *  A denied caller becomes the 403 forbidden page. The root layout cannot call
 *  forbidden(); it uses authorizeRequest and omits organization data instead.
 */
export async function authorizePage(
  permission: OrgPermission = "read",
  lookup: MembershipLookup = membershipStore,
): Promise<OrgAccess> {
  try {
    return await authorizeRequest({ headers: await headers() }, permission, lookup);
  } catch (error) {
    if (isDomainError(error) && error.code === "FORBIDDEN") forbidden();
    throw error;
  }
}
