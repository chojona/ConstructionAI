import type { MembershipStatus, OrgRole } from "./roles";

export const ROLE_LABELS: Record<OrgRole, string> = {
  ORG_ADMIN: "Org admin",
  REVIEWER: "Reviewer",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  DISABLED: "Disabled",
};

const updatedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function peopleUpdatedLabel(updatedAt: Date) {
  return updatedFormat.format(updatedAt);
}
