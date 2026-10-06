import { PeopleDesk, type PeopleRow } from "@/components/people/people-desk";
import { authorizePage } from "@/lib/auth/pageAccess";
import { peopleUpdatedLabel } from "@/lib/auth/peopleLabels";
import { listPeople } from "@/lib/auth/people";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const access = await authorizePage("manage_people");
  const people = await listPeople(access);
  const rows: PeopleRow[] = people.map((person) => ({
    membershipId: person.membershipId,
    name: person.name,
    email: person.email,
    role: person.role,
    status: person.status,
    updatedLabel: peopleUpdatedLabel(person.updatedAt),
  }));
  return (
    <main className="page">
      <PeopleDesk people={rows} />
    </main>
  );
}
