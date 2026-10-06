import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { membershipStore } from "./prismaMembership";
import { dummyPasswordHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { hashToken, newSecret, SESSION_TTL_MS } from "./sessionToken";
import type { CredentialStore, CredentialUser } from "./credentials";
import type { MembershipRecord } from "./roles";

const emailSchema = z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email.").transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200);

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const acceptTokenSchema = z.string().trim().min(20, "This invitation link is not valid.").max(200);

const acceptSchema = z.object({
  token: acceptTokenSchema,
  password: passwordSchema,
  name: z.string().trim().max(120).optional().transform((value) => value || null),
});

export function parseLoginRequest(raw: unknown) {
  return loginSchema.parse(raw);
}

export function parseAcceptRequest(raw: unknown) {
  return acceptSchema.parse(raw);
}

/** Email for an accept-token attempt, or null when the token identifies nobody. */
export async function findAcceptEmail(
  raw: unknown,
  store: Pick<CredentialStore, "findInvite"> = membershipStore,
): Promise<string | null> {
  const token = raw && typeof raw === "object" && "token" in raw ? raw.token : undefined;
  const parsed = acceptTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const invite = await store.findInvite(hashToken(parsed.data));
  const email = invite?.email.trim().toLowerCase() ?? "";
  return email || null;
}

export interface SignedInUser {
  userId: string;
  email: string;
  name: string | null;
  organizationId: string;
  token: string;
}

const INVALID_LOGIN = "Email or password is incorrect.";

function membershipGate(memberships: MembershipRecord[]): MembershipRecord {
  const active = memberships.filter((membership) => membership.status === "ACTIVE");
  if (active.length === 1) return active[0]!;
  if (active.length > 1) {
    throw new DomainError("FORBIDDEN", "Choose an organization.", 403);
  }
  if (memberships.some((membership) => membership.status === "INVITED")) {
    throw new DomainError("FORBIDDEN", "Accept the invitation before signing in.", 403);
  }
  if (memberships.some((membership) => membership.status === "DISABLED")) {
    throw new DomainError("FORBIDDEN", "This account is disabled for the organization.", 403);
  }
  throw new DomainError("FORBIDDEN", "You do not have access to this organization.", 403);
}

async function passwordMatches(user: CredentialUser | null, password: string) {
  const stored = user?.passwordHash ?? await dummyPasswordHash();
  const matches = await verifyPassword(password, stored);
  return Boolean(user?.passwordHash) && matches;
}

async function openSession(userId: string, store: CredentialStore) {
  const token = newSecret();
  await store.createSession(hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS));
  return token;
}

export async function loginWithPassword(
  raw: unknown,
  store: CredentialStore = membershipStore,
): Promise<SignedInUser> {
  const input = parseLoginRequest(raw);
  const user = await store.findUserCredential(input.email);
  const matches = await passwordMatches(user, input.password);
  if (!user || !matches) throw new DomainError("UNAUTHENTICATED", INVALID_LOGIN, 401);
  const membership = membershipGate(await store.listMembershipsForUser(user.id));
  const token = await openSession(user.id, store);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: membership.organizationId,
    token,
  };
}

export async function acceptInvitation(
  raw: unknown,
  store: CredentialStore = membershipStore,
): Promise<SignedInUser> {
  const input = parseAcceptRequest(raw);
  const invite = await store.findInvite(hashToken(input.token));
  if (!invite || !invite.expiresAt || invite.expiresAt.getTime() <= Date.now()) {
    throw new DomainError("INVALID_INPUT", "This invitation link is not valid.", 400);
  }
  if (invite.membership.status === "DISABLED") {
    throw new DomainError("FORBIDDEN", "This account is disabled for the organization.", 403);
  }
  if (invite.membership.status !== "INVITED") {
    throw new DomainError("INVALID_INPUT", "This invitation has already been accepted.", 400);
  }
  await store.setPasswordHash(invite.membership.userId, await hashPassword(input.password), input.name);
  const membership = await store.acceptInvite(invite.membership.id);
  if (membership.status !== "ACTIVE" || membership.userId !== invite.membership.userId) {
    throw new DomainError("INVALID_INPUT", "This invitation link is not valid.", 400);
  }
  const token = await openSession(membership.userId, store);
  return {
    userId: membership.userId,
    email: invite.email,
    name: input.name ?? invite.name,
    organizationId: membership.organizationId,
    token,
  };
}

export async function endSession(rawToken: string, store: CredentialStore = membershipStore) {
  const token = rawToken.trim();
  if (token) await store.deleteSession(hashToken(token));
}
