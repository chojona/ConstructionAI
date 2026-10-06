import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CredentialStore, CredentialUser, InviteRecord } from "./credentials";
import type {
  MembershipRecord,
  MembershipStatus,
  OrgRole,
  PeopleStore,
  PersonMembership,
  PersonRecord,
} from "./roles";

function toMembership(row: {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
}): MembershipRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    status: row.status,
  };
}

export class PrismaMembershipStore implements PeopleStore, CredentialStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findMembership(userId: string, organizationId: string) {
    const row = await this.db.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return row ? toMembership(row) : null;
  }

  async listActiveMemberships(userId: string) {
    const rows = await this.db.orgMembership.findMany({ where: { userId, status: "ACTIVE" } });
    return rows.map(toMembership);
  }

  async listMembershipsForUser(userId: string) {
    const rows = await this.db.orgMembership.findMany({ where: { userId } });
    return rows.map(toMembership);
  }

  async findUserByEmail(email: string): Promise<PersonRecord | null> {
    const user = await this.db.user.findUnique({ where: { email } });
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  }

  async createUser(input: { email: string; name: string | null }): Promise<PersonRecord> {
    const user = await this.db.user.create({ data: { email: input.email, name: input.name } });
    return { id: user.id, email: user.email, name: user.name };
  }

  async createMembership(input: {
    organizationId: string;
    userId: string;
    role: OrgRole;
    status: MembershipStatus;
  }) {
    const row = await this.db.orgMembership.create({ data: input });
    return toMembership(row);
  }

  async findMembershipById(id: string) {
    const row = await this.db.orgMembership.findUnique({ where: { id } });
    return row ? toMembership(row) : null;
  }

  async setStatus(id: string, status: MembershipStatus) {
    const row = await this.db.orgMembership.update({ where: { id }, data: { status } });
    return toMembership(row);
  }

  async setRole(id: string, role: OrgRole) {
    const row = await this.db.orgMembership.update({ where: { id }, data: { role } });
    return toMembership(row);
  }

  async userHasPassword(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    return Boolean(user?.passwordHash);
  }

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.db.orgMembership.count({ where: { organizationId, role, status: "ACTIVE" } });
  }

  async saveAcceptToken(membershipId: string, tokenHash: string, expiresAt: Date) {
    await this.db.orgMembership.update({
      where: { id: membershipId },
      data: { acceptTokenHash: tokenHash, acceptTokenExpiresAt: expiresAt },
    });
  }

  async findUserCredential(email: string): Promise<CredentialUser | null> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name, passwordHash: user.passwordHash };
  }

  async setPasswordHash(userId: string, passwordHash: string, name?: string | null) {
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash, ...(name !== undefined ? { name } : {}) },
    });
  }

  async findInvite(tokenHash: string): Promise<InviteRecord | null> {
    const row = await this.db.orgMembership.findUnique({
      where: { acceptTokenHash: tokenHash },
      include: { user: true, organization: true },
    });
    if (!row) return null;
    return {
      membership: toMembership(row),
      email: row.user.email,
      name: row.user.name,
      organizationName: row.organization.name,
      expiresAt: row.acceptTokenExpiresAt,
    };
  }

  async acceptInvite(membershipId: string) {
    const row = await this.db.orgMembership.update({
      where: { id: membershipId },
      data: { status: "ACTIVE", acceptTokenHash: null, acceptTokenExpiresAt: null },
    });
    return toMembership(row);
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    await this.db.session.create({ data: { tokenHash, userId, expiresAt } });
  }

  async deleteSession(tokenHash: string) {
    await this.db.session.deleteMany({ where: { tokenHash } });
  }

  async findValidSession(tokenHash: string) {
    const row = await this.db.session.findUnique({ where: { tokenHash } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.db.session.delete({ where: { id: row.id } }).catch(() => undefined);
      return null;
    }
    return { userId: row.userId };
  }

  async listPeople(organizationId: string): Promise<PersonMembership[]> {
    const rows = await this.db.orgMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      membershipId: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      email: row.user.email,
      name: row.user.name,
      role: row.role,
      status: row.status,
      updatedAt: row.updatedAt,
    }));
  }
}

export const membershipStore = new PrismaMembershipStore();
