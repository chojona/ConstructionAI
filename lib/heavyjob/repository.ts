import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { HeavyJobObjectType } from "./fixtures";

export interface HeavyJobSourceObjectRecord {
  id: string;
  projectId: string;
  objectType: HeavyJobObjectType;
  sourceId: string;
  fetchedAt: Date;
  raw: Prisma.JsonValue;
  createdAt: Date;
}

export interface HeavyJobSourceRepository {
  listForProject(
    organizationId: string,
    projectId: string,
    objectType?: HeavyJobObjectType,
  ): Promise<HeavyJobSourceObjectRecord[] | null>;
}

export class PrismaHeavyJobSourceRepository implements HeavyJobSourceRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listForProject(organizationId: string, projectId: string, objectType?: HeavyJobObjectType) {
    const project = await this.db.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) return null;
    const rows = await this.db.heavyJobSourceObject.findMany({
      where: { projectId, ...(objectType ? { objectType } : {}) },
      orderBy: [{ objectType: "asc" }, { fetchedAt: "desc" }, { sourceId: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      ...row,
      objectType: row.objectType as HeavyJobObjectType,
    }));
  }
}

export const heavyJobSourceRepository = new PrismaHeavyJobSourceRepository();
