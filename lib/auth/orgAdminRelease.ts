import type { MembershipRecord, OrgAdminRelease, OrgAdminReleaseResult } from "./roles";

/** In-process queue so overlapping releases cannot both pass the admin count. */
export function createReleaseQueue() {
  let queue: Promise<void> = Promise.resolve();
  return function exclusive<T>(work: () => T | Promise<T>): Promise<T> {
    const run = queue.then(work, work);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
}

/**
 * Apply a demote or disable only when an active org admin would remain.
 * The membership list is mutated in place. Callers must not interleave this
 * with another release of the same list.
 */
export function applyOrgAdminRelease(
  memberships: MembershipRecord[],
  membershipId: string,
  change: OrgAdminRelease,
): OrgAdminReleaseResult {
  const row = memberships.find((item) => item.id === membershipId);
  if (!row) return { outcome: "missing" };
  const nextRole = "role" in change ? change.role : row.role;
  const nextStatus = "status" in change ? change.status : row.status;
  const dropsAdmin = row.role === "ORG_ADMIN"
    && row.status === "ACTIVE"
    && (nextRole !== "ORG_ADMIN" || nextStatus !== "ACTIVE");
  if (dropsAdmin) {
    const admins = memberships.filter((item) =>
      item.organizationId === row.organizationId && item.role === "ORG_ADMIN" && item.status === "ACTIVE").length;
    if (admins <= 1) return { outcome: "blocked" };
  }
  if ("role" in change) row.role = change.role;
  if ("status" in change) row.status = change.status;
  return { outcome: "updated", membership: row };
}
