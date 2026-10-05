import { DomainError } from "@/lib/domain/errors";
import type { SessionLookup } from "./credentials";
import { membershipStore } from "./prismaMembership";
import { hashToken, SESSION_COOKIE, trustsUserHeader } from "./sessionToken";
import {
  roleAllows,
  type MembershipLookup,
  type MembershipRecord,
  type OrgPermission,
  type OrgRole,
} from "./roles";

export interface AccessRequest {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}

export interface OrgAccess {
  organizationId: string;
  userId: string;
  role: OrgRole;
  /** True when the caller is a signed-in user (session or the temporary trusted header). */
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
  if (active.length > 1) throw new DomainError("FORBIDDEN", "Choose an organization.", 403);
  const memberships = await lookup.listMembershipsForUser(userId);
  if (memberships.some((membership) => membership.status === "DISABLED")) {
    throw new DomainError("FORBIDDEN", "This account is disabled for the organization.", 403);
  }
  if (memberships.some((membership) => membership.status === "INVITED")) {
    throw new DomainError("FORBIDDEN", "Accept the invitation before using the organization.", 403);
  }
  throw new DomainError("FORBIDDEN", NO_ACCESS, 403);
}

async function resolveUserId(request: AccessRequest, sessions: SessionLookup): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value?.trim() || "";
  if (token) {
    const session = await sessions.findValidSession(hashToken(token));
    if (session) return session.userId;
  }
  if (trustsUserHeader()) {
    const headerUser = request.headers.get("x-user-id")?.trim() || "";
    if (headerUser) return headerUser;
  }
  return null;
}

/** Resolve the person and organization for a gated API route or server page.
 *  A session cookie is the caller. x-organization-id is only a claim that must
 *  match an active membership. x-user-id is honored only when
 *  AUTH_TRUST_USER_HEADER=1 (temporary tests and local scripts). A request with
 *  neither a session nor that header is rejected.
 */
export async function authorizeRequest(
  request: AccessRequest,
  permission: OrgPermission,
  lookup: MembershipLookup = membershipStore,
  sessions: SessionLookup = membershipStore,
): Promise<OrgAccess> {
  const userId = await resolveUserId(request, sessions);
  if (!userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const headerOrg = request.headers.get("x-organization-id")?.trim() || "";
  const organizationId = headerOrg || await onlyActiveOrganization(lookup, userId);
  const membership = await lookup.findMembership(userId, organizationId);
  assertMembership(membership, permission);
  return { organizationId, userId, role: membership.role, named: true };
}

/** Signed-in people are stored by User id. */
export function withLedgerActor(access: OrgAccess, body: unknown): unknown {
  if (!access.named || !body || typeof body !== "object" || Array.isArray(body)) return body;
  return { ...body, actorId: access.userId };
}
