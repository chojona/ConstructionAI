import type { HeavyJobSourceObjectRecord } from "./repository";

export function toHeavyJobSourceObjectDto(record: HeavyJobSourceObjectRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    objectType: record.objectType,
    sourceId: record.sourceId,
    fetchedAt: record.fetchedAt.toISOString(),
    raw: record.raw,
    createdAt: record.createdAt.toISOString(),
  };
}

export type HeavyJobSourceObjectDto = ReturnType<typeof toHeavyJobSourceObjectDto>;
