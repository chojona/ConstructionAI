import { PeopleDesk, type PeopleRow } from "@/components/workspace/people-desk";
import { authorizePage } from "@/lib/auth/pageAccess";
import { listPeople } from "@/lib/auth/people";

export const dynamic = "force-dynamic";

const updatedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default async function PeoplePage() {
  const access = await authorizePage("manage_people");
  const people = await listPeople(access);
  const rows: PeopleRow[] = people.map((person) => ({
    membershipId: person.membershipId,
    userId: person.userId,
    email: person.email,
    name: person.name,
    role: person.role,
    status: person.status,
    updatedLabel: updatedFormat.format(person.updatedAt),
  }));
  return (
    <main className="page">
      <PeopleDesk people={rows} currentUserId={access.userId} />
    </main>
  );
}
