import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipRecord, OrgRole, PersonMembership } from "./roles";

const { headerState, findMembership, listActiveMemberships, listMembershipsForUser, listPeople } = vi.hoisted(() => ({
  headerState: new Map<string, string>(),
  findMembership: vi.fn(),
  listActiveMemberships: vi.fn(),
  listMembershipsForUser: vi.fn(),
  listPeople: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerState.get(name.toLowerCase()) ?? null,
  }),
  cookies: async () => ({
    get: () => undefined,
  }),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => "/projects",
    useRouter: () => ({ refresh() {}, push() {} }),
  };
});

vi.mock("@/lib/auth/prismaMembership", () => ({
  membershipStore: { findMembership, listActiveMemberships, listMembershipsForUser, listPeople },
}));

import PeoplePage from "@/app/people/page";
import { AppShell } from "@/components/workspace/app-shell";
import { peopleUpdatedLabel } from "./peopleLabels";

const rows: MembershipRecord[] = [];

function setHeaders(values: Record<string, string>) {
  headerState.clear();
  for (const [key, value] of Object.entries(values)) headerState.set(key.toLowerCase(), value);
}

function member(role: OrgRole, userId: string, organizationId = "org_a"): MembershipRecord {
  return { id: `membership_${userId}`, organizationId, userId, role, status: "ACTIVE" };
}

function person(overrides: Partial<PersonMembership> & Pick<PersonMembership, "email" | "role" | "status">): PersonMembership {
  return {
    membershipId: overrides.membershipId ?? `membership_${overrides.email}`,
    organizationId: "org_a",
    userId: overrides.userId ?? "user_person",
    name: overrides.name ?? null,
    updatedAt: overrides.updatedAt ?? new Date("2026-10-06T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  rows.length = 0;
  headerState.clear();
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "1";
  findMembership.mockImplementation(async (userId: string, organizationId: string) =>
    rows.find((row) => row.userId === userId && row.organizationId === organizationId) ?? null);
  listActiveMemberships.mockImplementation(async (userId: string) =>
    rows.filter((row) => row.userId === userId && row.status === "ACTIVE"));
  listMembershipsForUser.mockImplementation(async (userId: string) =>
    rows.filter((row) => row.userId === userId));
  listPeople.mockReset();
});

function mainNav(html: string) {
  return html.split('aria-label="Main"')[1]?.split("</nav>")[0] ?? "";
}

describe("people desk chrome", () => {
  it("keeps People out of the primary workspace nav", () => {
    const admin = renderToStaticMarkup(createElement(AppShell, { projects: [], canManagePeople: true }, "desk"));
    const main = mainNav(admin);
    expect(main).toContain("Projects");
    expect(main).toContain("Changes");
    expect(main).not.toContain("People");
    expect(main).not.toContain("/people");
    expect(admin).toContain('aria-label="Organization"');
    expect(admin.match(/href="\/people"/g)).toHaveLength(2);

    const memberShell = renderToStaticMarkup(createElement(AppShell, { projects: [], canManagePeople: false }, "desk"));
    expect(memberShell).not.toContain('href="/people"');
    expect(memberShell).not.toContain('aria-label="Organization"');
    expect(mainNav(memberShell)).toContain("Projects");
  });

  it("formats the updated column in UTC", () => {
    expect(peopleUpdatedLabel(new Date("2026-10-06T12:00:00.000Z"))).toBe("Oct 6, 2026");
  });

  it("sends anyone who is not an org admin to the forbidden page", async () => {
    for (const role of ["REVIEWER", "CONTRIBUTOR", "VIEWER"] as const) {
      rows.length = 0;
      rows.push(member(role, "user_member"));
      setHeaders({ "x-user-id": "user_member", "x-organization-id": "org_a" });
      await expect(PeoplePage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
    }
    rows.length = 0;
    rows.push(member("ORG_ADMIN", "user_b", "org_b"));
    setHeaders({ "x-user-id": "user_b", "x-organization-id": "org_a" });
    await expect(PeoplePage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
    expect(listPeople).not.toHaveBeenCalled();
  });

  it("renders name, email, role, status, and updated for an org admin", async () => {
    rows.push(member("ORG_ADMIN", "user_admin"));
    setHeaders({ "x-user-id": "user_admin", "x-organization-id": "org_a" });
    listPeople.mockResolvedValue([
      person({
        membershipId: "membership_admin",
        userId: "user_admin",
        email: "lead@northstar.example",
        name: "Lead",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      }),
      person({
        membershipId: "membership_pe",
        userId: "user_pe",
        email: "pe@northstar.example",
        name: "Pat Lee",
        role: "REVIEWER",
        status: "INVITED",
      }),
      person({
        membershipId: "membership_off",
        userId: "user_off",
        email: "off@northstar.example",
        name: null,
        role: "VIEWER",
        status: "DISABLED",
      }),
    ]);
    const html = renderToStaticMarkup(await PeoplePage());
    expect(html).toContain(">People<");
    expect(html).toContain(">Name<");
    expect(html).toContain(">Email<");
    expect(html).toContain(">Role<");
    expect(html).toContain(">Status<");
    expect(html).toContain(">Updated<");
    expect(html).toContain("Lead");
    expect(html).toContain("lead@northstar.example");
    expect(html).toContain("Org admin");
    expect(html).toContain("Active");
    expect(html).toContain("Pat Lee");
    expect(html).toContain("Invited");
    expect(html).toContain("Disabled");
    expect(html).toContain("Oct 6, 2026");
    expect(html).toContain("Re-enable");
    expect(html).toContain(">Invite<");
    expect(html).not.toContain("DSC");
  });
});
