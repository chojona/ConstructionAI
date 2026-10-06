import type { ReviewerDirectoryEntry } from "./roles";

export interface ApprovalSignoff {
  /** Recorded person. Never blank and never the word Unknown. */
  name: string;
  disabled: boolean;
}

const UNKNOWN = /^unknown$/i;
const FALLBACK_NAME = "Recorded reviewer";
const RAW_USER_ID = /^(?:user_[A-Za-z0-9_-]+|c[a-z0-9]{24,})$/;

function usableName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || UNKNOWN.test(trimmed)) return "";
  return trimmed;
}

/** A stored user id is not a display name. A typed reviewer label still is. */
function usableRecordedLabel(value: string | null | undefined) {
  const trimmed = usableName(value);
  if (!trimmed || RAW_USER_ID.test(trimmed)) return "";
  return trimmed;
}

/**
 * Display name for a past approval. The stored reviewer id is not rewritten.
 * Order: usable person name, then usable email, then a typed label, then "Recorded reviewer".
 * A directory lookup skips the stored id so a missing name never prints the user id.
 */
export function approvalSignoff(
  recorded: string | null | undefined,
  options?: { knownName?: string | null; knownEmail?: string | null; disabled?: boolean },
): ApprovalSignoff {
  const fromDirectory = options !== undefined && ("knownName" in options || "knownEmail" in options);
  const name = usableName(options?.knownName)
    || usableName(options?.knownEmail)
    || (fromDirectory ? "" : usableRecordedLabel(recorded))
    || FALLBACK_NAME;
  return { name, disabled: options?.disabled === true };
}

export function signoffForReviewer(
  recorded: string | null | undefined,
  directory: readonly ReviewerDirectoryEntry[],
): ApprovalSignoff {
  const person = recorded ? directory.find((entry) => entry.userId === recorded) : undefined;
  if (!person) return approvalSignoff(recorded);
  return approvalSignoff(recorded, {
    knownName: person.name,
    knownEmail: person.email,
    disabled: person.status === "DISABLED",
  });
}
