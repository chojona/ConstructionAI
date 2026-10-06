import { cache } from "react";
import { prisma } from "@/lib/db";
import type { SessionLookup } from "./credentials";
import type { AccessRequest } from "./membership";
import { pageAccessRequest } from "./pageAccess";
import { membershipStore } from "./prismaMembership";
import { hashToken, SESSION_COOKIE } from "./sessionToken";

export interface SessionViewer {
  /** Member name, or email when the name is blank. */
  label: string;
}

export interface SessionUserLookup {
  findUserIdentity(userId: string): Promise<{ name: string | null; email: string } | null>;
}

/**
 * Person on a valid construction_session cookie.
 * x-user-id is not a session, including when AUTH_TRUST_USER_HEADER is set.
 */
export async function readSessionViewer(
  request: AccessRequest,
  sessions: SessionLookup,
  users: SessionUserLookup,
): Promise<SessionViewer | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value?.trim() || "";
  if (!token) return null;
  const session = await sessions.findValidSession(hashToken(token));
  if (!session) return null;
  const user = await users.findUserIdentity(session.userId);
  const label = user?.name?.trim() || user?.email?.trim() || "";
  return label ? { label } : null;
}

const prismaUsers: SessionUserLookup = {
  async findUserIdentity(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
  },
};

export const currentSessionViewer = cache(async (): Promise<SessionViewer | null> => {
  return readSessionViewer(await pageAccessRequest(), membershipStore, prismaUsers);
});
