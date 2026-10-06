import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { assertRole, type OrgAccess } from "./membership";
import { membershipStore } from "./prismaMembership";
import { acceptPath, hashToken, INVITE_TTL_MS, newSecret } from "./sessionToken";
import {
  type PeopleStore,
  type PersonMembership,
  type PersonRecord,
  type MembershipRecord,
} from "./roles";

const inviteSchema = z.object({
  email: z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email.").transform((value) => value.toLowerCase()),
  name: z.string().trim().max(120).optional().transform((value) => value || null),
  role: z.enum(["ORG_ADMIN", "REVIEWER", "CONTRIBUTOR", "VIEWER"]),
});

export interface InvitedMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string | null;
  role: MembershipRecord["role"];
  status: MembershipRecord["status"];
  /** Raw token returned once. Only the hash is stored. */
  acceptToken: string;
  acceptPath: string;
}

async function issueAcceptToken(store: PeopleStore, membershipId: string) {
  const acceptToken = newSecret();
  await store.saveAcceptToken(membershipId, hashToken(acceptToken), new Date(Date.now() + INVITE_TTL_MS));
  return { acceptToken, acceptPath: acceptPath(acceptToken) };
}

function invitedMember(
  user: PersonRecord,
  membership: MembershipRecord,
  issued: { acceptToken: string; acceptPath: string },
): InvitedMember {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: membership.role,
    status: membership.status,
    acceptToken: issued.acceptToken,
    acceptPath: issued.acceptPath,
  };
}

export async function listPeople(
  access: OrgAccess,
  store: PeopleStore = membershipStore,
): Promise<PersonMembership[]> {
  assertRole(access.role, "manage_people");
  return store.listPeople(access.organizationId);
}

export async function inviteMember(
  access: OrgAccess,
  raw: unknown,
  store: PeopleStore = membershipStore,
): Promise<InvitedMember> {
  assertRole(access.role, "manage_people");
  const input = inviteSchema.parse(raw);
  const existing = await store.findUserByEmail(input.email);
  if (existing) {
    const memberships = await store.listMembershipsForUser(existing.id);
    const here = memberships.find((membership) => membership.organizationId === access.organizationId);
    if (here) {
      throw new DomainError(
        "INVALID_INPUT",
        here.status === "DISABLED"
          ? "That person is disabled in this organization."
          : "That person already belongs to this organization.",
        400,
      );
    }
    if (memberships.length > 0) {
      throw new DomainError("INVALID_INPUT", "A person can belong to one organization for now.", 400);
    }
    const membership = await store.createMembership({
      organizationId: access.organizationId,
      userId: existing.id,
      role: input.role,
      status: "INVITED",
    });
    return invitedMember(existing, membership, await issueAcceptToken(store, membership.id));
  }

  const user = await store.createUser({ email: input.email, name: input.name });
  const membership = await store.createMembership({
    organizationId: access.organizationId,
    userId: user.id,
    role: input.role,
    status: "INVITED",
  });
  return invitedMember(user, membership, await issueAcceptToken(store, membership.id));
}

/** Replace the accept token for a membership that is still invited. */
export async function refreshAcceptToken(
  access: OrgAccess,
  membershipId: string,
  store: PeopleStore = membershipStore,
): Promise<{ acceptToken: string; acceptPath: string }> {
  assertRole(access.role, "manage_people");
  const membership = await store.findMembershipById(membershipId);
  if (!membership || membership.organizationId !== access.organizationId) {
    throw new DomainError("NOT_FOUND", "Membership not found.", 404);
  }
  if (membership.status !== "INVITED") {
    throw new DomainError("INVALID_INPUT", "Only an invited person can receive a new accept link.", 400);
  }
  return issueAcceptToken(store, membership.id);
}

export async function disableMember(
  access: OrgAccess,
  membershipId: string,
  store: PeopleStore = membershipStore,
): Promise<MembershipRecord> {
  assertRole(access.role, "manage_people");
  const membership = await store.findMembershipById(membershipId);
  if (!membership || membership.organizationId !== access.organizationId) {
    throw new DomainError("NOT_FOUND", "Membership not found.", 404);
  }
  if (membership.status === "DISABLED") return membership;
  if (membership.role === "ORG_ADMIN" && membership.status === "ACTIVE") {
    const admins = await store.countActiveRole(access.organizationId, "ORG_ADMIN");
    if (admins <= 1) {
      throw new DomainError("INVALID_INPUT", "The organization needs an active org admin.", 400);
    }
  }
  return store.setStatus(membership.id, "DISABLED");
}

const roleSchema = z.object({
  role: z.enum(["ORG_ADMIN", "REVIEWER", "CONTRIBUTOR", "VIEWER"]),
});

export async function changeMemberRole(
  access: OrgAccess,
  membershipId: string,
  raw: unknown,
  store: PeopleStore = membershipStore,
): Promise<MembershipRecord> {
  assertRole(access.role, "manage_people");
  const input = roleSchema.parse(raw);
  const membership = await store.findMembershipById(membershipId);
  if (!membership || membership.organizationId !== access.organizationId) {
    throw new DomainError("NOT_FOUND", "Membership not found.", 404);
  }
  if (membership.role === input.role) return membership;
  if (membership.role === "ORG_ADMIN" && membership.status === "ACTIVE") {
    const admins = await store.countActiveRole(access.organizationId, "ORG_ADMIN");
    if (admins <= 1) {
      throw new DomainError("INVALID_INPUT", "The organization needs an active org admin.", 400);
    }
  }
  return store.setRole(membership.id, input.role);
}

/** Restore access. Role stays as it was. A person who never set a password returns to Invited. */
export async function enableMember(
  access: OrgAccess,
  membershipId: string,
  store: PeopleStore = membershipStore,
): Promise<MembershipRecord> {
  assertRole(access.role, "manage_people");
  const membership = await store.findMembershipById(membershipId);
  if (!membership || membership.organizationId !== access.organizationId) {
    throw new DomainError("NOT_FOUND", "Membership not found.", 404);
  }
  if (membership.status !== "DISABLED") return membership;
  const status = await store.userHasPassword(membership.userId) ? "ACTIVE" : "INVITED";
  return store.setStatus(membership.id, status);
}
