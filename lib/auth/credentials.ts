import type { MembershipRecord } from "./roles";

export interface CredentialUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
}

export interface InviteRecord {
  membership: MembershipRecord;
  email: string;
  name: string | null;
  organizationName: string;
  expiresAt: Date | null;
}

export interface SessionLookup {
  findValidSession(tokenHash: string): Promise<{ userId: string } | null>;
}

export interface CredentialStore extends SessionLookup {
  findUserCredential(email: string): Promise<CredentialUser | null>;
  listMembershipsForUser(userId: string): Promise<MembershipRecord[]>;
  setPasswordHash(userId: string, passwordHash: string, name?: string | null): Promise<void>;
  findInvite(tokenHash: string): Promise<InviteRecord | null>;
  acceptInvite(membershipId: string): Promise<MembershipRecord>;
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
}
