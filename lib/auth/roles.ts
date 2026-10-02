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

export interface PersonMembership {
  membershipId: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  status: MembershipStatus;
}

export interface MembershipLookup {
  findMembership(userId: string, organizationId: string): Promise<MembershipRecord | null>;
  listActiveMemberships(userId: string): Promise<MembershipRecord[]>;
}

export interface PeopleStore extends MembershipLookup {
  findUserByEmail(email: string): Promise<PersonRecord | null>;
  createUser(input: { email: string; name: string | null }): Promise<PersonRecord>;
  listMembershipsForUser(userId: string): Promise<MembershipRecord[]>;
  createMembership(input: {
    organizationId: string;
    userId: string;
    role: OrgRole;
    status: MembershipStatus;
  }): Promise<MembershipRecord>;
  findMembershipById(id: string): Promise<MembershipRecord | null>;
  setStatus(id: string, status: MembershipStatus): Promise<MembershipRecord>;
  countActiveRole(organizationId: string, role: OrgRole): Promise<number>;
  listPeople(organizationId: string): Promise<PersonMembership[]>;
}
