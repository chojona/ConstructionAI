export const ORG_ROLES = ["ORG_ADMIN", "REVIEWER", "CONTRIBUTOR", "VIEWER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["INVITED", "ACTIVE", "DISABLED"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ORG_PERMISSIONS = ["read", "upload", "approve", "export", "draft_email", "manage_people"] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

/** Distinctive V0 powers live on the role that the field named.
 *  Org admin also holds the operational permissions so the seeded desk can run.
 *  Reviewer does not gain upload; Contributor does not gain approve or export.
 */
export const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
  ORG_ADMIN: ["read", "upload", "approve", "export", "draft_email", "manage_people"],
  REVIEWER: ["read", "approve", "export", "draft_email"],
  CONTRIBUTOR: ["read", "upload"],
  VIEWER: ["read"],
};

export function roleAllows(role: OrgRole, permission: OrgPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
}

export interface PersonRecord {
  id: string;
  email: string;
  name: string | null;
}

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  ORG_ADMIN: "Org admin",
  REVIEWER: "Reviewer",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DISABLED: "Disabled",
};

/** Status pills for the People table. Colors come from existing tokens. */
export function membershipStatusClass(status: MembershipStatus) {
  if (status === "INVITED") return "status-info";
  if (status === "DISABLED") return "status-danger-subtle";
  return "status-neutral";
}

export interface PersonMembership {
  membershipId: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  status: MembershipStatus;
  updatedAt: Date;
}

export interface MembershipLookup {
  findMembership(userId: string, organizationId: string): Promise<MembershipRecord | null>;
  listActiveMemberships(userId: string): Promise<MembershipRecord[]>;
  listMembershipsForUser(userId: string): Promise<MembershipRecord[]>;
}

export interface PeopleStore extends MembershipLookup {
  findUserByEmail(email: string): Promise<PersonRecord | null>;
  createUser(input: { email: string; name: string | null }): Promise<PersonRecord>;
  createMembership(input: {
    organizationId: string;
    userId: string;
    role: OrgRole;
    status: MembershipStatus;
  }): Promise<MembershipRecord>;
  findMembershipById(id: string): Promise<MembershipRecord | null>;
  setStatus(id: string, status: MembershipStatus): Promise<MembershipRecord>;
  setRole(id: string, role: OrgRole): Promise<MembershipRecord>;
  /** True when the person has set a password and can sign in once active. */
  userHasPassword(userId: string): Promise<boolean>;
  countActiveRole(organizationId: string, role: OrgRole): Promise<number>;
  listPeople(organizationId: string): Promise<PersonMembership[]>;
  saveAcceptToken(membershipId: string, tokenHash: string, expiresAt: Date): Promise<void>;
}
