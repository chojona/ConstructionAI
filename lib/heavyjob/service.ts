import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { HEAVYJOB_OBJECT_TYPES, type HeavyJobObjectType } from "./fixtures";
import { heavyJobSourceRepository, type HeavyJobSourceRepository } from "./repository";

export const heavyJobObjectTypeSchema = z.enum(HEAVYJOB_OBJECT_TYPES);

export function parseHeavyJobObjectTypeFilter(value: string | null): HeavyJobObjectType | undefined {
  if (value === null || value === "") return undefined;
  return heavyJobObjectTypeSchema.parse(value);
}

export async function listHeavyJobSourceObjects(
  organizationId: string,
  projectId: string,
  objectType?: HeavyJobObjectType,
  repository: HeavyJobSourceRepository = heavyJobSourceRepository,
) {
  const objects = await repository.listForProject(organizationId, projectId, objectType);
  if (!objects) throw new DomainError("NOT_FOUND", "Project not found.", 404);
  return objects;
}
