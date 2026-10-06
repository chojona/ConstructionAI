import type { ReviewerDirectoryEntry } from "./roles";

export interface ApprovalSignoff {
  /** Recorded person. Never blank and never the word Unknown. */
  name: string;
  disabled: boolean;
}

const UNKNOWN = /^unknown$/i;
const FALLBACK_NAME = "Recorded reviewer";

function usableName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || UNKNOWN.test(trimmed)) return "";
  return trimmed;
}

/** Display name for a past approval. The stored reviewer id is not rewritten. */
export function approvalSignoff(
  recorded: string | null | undefined,
  options?: { knownName?: string | null; disabled?: boolean },
): ApprovalSignoff {
  const name = usableName(options?.knownName) || usableName(recorded) || FALLBACK_NAME;
  return { name, disabled: options?.disabled === true };
}

export function signoffForReviewer(
  recorded: string | null | undefined,
  directory: readonly ReviewerDirectoryEntry[],
): ApprovalSignoff {
  const person = recorded ? directory.find((entry) => entry.userId === recorded) : undefined;
  return approvalSignoff(recorded, {
    knownName: person?.name,
    disabled: person?.status === "DISABLED",
  });
}
