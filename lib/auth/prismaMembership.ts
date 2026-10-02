import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
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

export class PrismaMembershipStore implements PeopleStore {
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

  async countActiveRole(organizationId: string, role: OrgRole) {
    return this.db.orgMembership.count({ where: { organizationId, role, status: "ACTIVE" } });
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
    }));
  }
}

export const membershipStore = new PrismaMembershipStore();
