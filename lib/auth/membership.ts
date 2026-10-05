import type { NextRequest } from "next/server";
import { DomainError } from "@/lib/domain/errors";
import { currentOrganizationId } from "@/lib/tenancy";
import { DEMO_USER_ID } from "./demoUser";
import { membershipStore } from "./prismaMembership";
import {
  roleAllows,
  type MembershipLookup,
  type MembershipRecord,
  type OrgPermission,
  type OrgRole,
} from "./roles";

export interface OrgAccess {
  organizationId: string;
  userId: string;
  role: OrgRole;
  /** True when the caller sent x-user-id. Ledger rows then store that User id. */
  named: boolean;
}

const NO_ACCESS = "You do not have access to this organization.";

export function assertRole(role: OrgRole, permission: OrgPermission) {
  if (!roleAllows(role, permission)) {
    throw new DomainError("FORBIDDEN", "Your role cannot do that.", 403);
  }
}

function assertMembership(
  membership: MembershipRecord | null,
  permission: OrgPermission,
): asserts membership is MembershipRecord {
  if (!membership) throw new DomainError("FORBIDDEN", NO_ACCESS, 403);
  if (membership.status === "DISABLED") {
    throw new DomainError("FORBIDDEN", "This account is disabled for the organization.", 403);
  }
  if (membership.status !== "ACTIVE") {
    throw new DomainError("FORBIDDEN", "Accept the invitation before using the organization.", 403);
  }
  assertRole(membership.role, permission);
}

async function onlyActiveOrganization(lookup: MembershipLookup, userId: string) {
  const active = await lookup.listActiveMemberships(userId);
  if (active.length === 1) return active[0]!.organizationId;
  throw new DomainError("FORBIDDEN", active.length === 0 ? NO_ACCESS : "Choose an organization.", 403);
}

interface HeaderSource {
  get(name: string): string | null;
}

/** Resolve the person and organization for a gated route or server page.
 *  x-user-id is the phase-1 person. The organization header is only a claim that
 *  must match an active membership. Omitting the person keeps the demo desk on
 *  APP_ORGANIZATION_ID, using the seeded member when that row exists.
 */
export async function authorizeRequest(
  request: NextRequest | { headers: HeaderSource },
  permission: OrgPermission,
  lookup: MembershipLookup = membershipStore,
): Promise<OrgAccess> {
  const namedUserId = request.headers.get("x-user-id")?.trim() || "";
  const headerOrg = request.headers.get("x-organization-id")?.trim() || "";

  if (namedUserId) {
    const organizationId = headerOrg || await onlyActiveOrganization(lookup, namedUserId);
    const membership = await lookup.findMembership(namedUserId, organizationId);
    assertMembership(membership, permission);
    return { organizationId, userId: namedUserId, role: membership.role, named: true };
  }

  const organizationId = headerOrg || currentOrganizationId();
  const membership = await lookup.findMembership(DEMO_USER_ID, organizationId);
  if (membership) {
    assertMembership(membership, permission);
    return { organizationId, userId: DEMO_USER_ID, role: membership.role, named: false };
  }
  if (organizationId !== currentOrganizationId()) {
    throw new DomainError("FORBIDDEN", NO_ACCESS, 403);
  }
  assertRole("ORG_ADMIN", permission);
  return { organizationId, userId: DEMO_USER_ID, role: "ORG_ADMIN", named: false };
}

/** Named people are stored by User id. The demo desk still records the typed name. */
export function withLedgerActor(access: OrgAccess, body: unknown): unknown {
  if (!access.named || !body || typeof body !== "object" || Array.isArray(body)) return body;
  return { ...body, actorId: access.userId };
}
