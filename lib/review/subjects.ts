import { factSlotKey, type ComparableFact } from "@/lib/revisions/compareFacts";

export function proposedFactSubjectKey(proposedFactId: string) {
  return `proposed-fact:${proposedFactId}`;
}

export function removalSubjectKey(input: {
  baseRevisionId: string;
  revisedRevisionId: string;
  before: ComparableFact & { id: string };
}) {
  return `revision-change:${input.baseRevisionId}:${input.revisedRevisionId}:REMOVED:${factSlotKey(input.before)}:${input.before.id}`;
}
