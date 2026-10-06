"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/auth/peopleLabels";
import { ORG_ROLES, type MembershipStatus, type OrgRole } from "@/lib/auth/roles";

export interface PeopleRow {
  membershipId: string;
  name: string | null;
  email: string;
  role: OrgRole;
  status: MembershipStatus;
  updatedLabel: string;
}

interface IssuedLink {
  email: string;
  href: string;
}

const STATUS_CLASS: Record<MembershipStatus, string> = {
  INVITED: "membership-invited",
  ACTIVE: "membership-active",
  DISABLED: "membership-disabled",
};

function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value);
}

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.error?.message;
    throw new Error(typeof message === "string" ? message : "Could not update people.");
  }
  return result;
}

export function PeopleDesk({ people }: { people: PeopleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"invite" | "update" | null>(null);
  const [links, setLinks] = useState<IssuedLink[]>([]);
  const [copied, setCopied] = useState("");
  const activeAdmins = people.filter((person) => person.role === "ORG_ADMIN" && person.status === "ACTIVE").length;

  function rememberLink(email: string, acceptPath: string) {
    const href = new URL(acceptPath, window.location.origin).href;
    setLinks((current) => [{ email, href }, ...current.filter((link) => link.href !== href)]);
    setCopied("");
  }

  async function run(kind: "invite" | "update", action: () => Promise<void>) {
    setPending(kind);
    setError("");
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update people.");
    } finally {
      setPending(null);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const role = String(data.get("role") ?? "");
    if (!isOrgRole(role)) return;
    await run("invite", async () => {
      const result = await postJson("/api/org/memberships", { email, role });
      const acceptPath = result?.membership?.acceptPath;
      if (typeof acceptPath !== "string") throw new Error("Could not create the accept link.");
      rememberLink(email, acceptPath);
      form.reset();
    });
  }

  async function changeRole(person: PeopleRow, role: string) {
    if (!isOrgRole(role) || role === person.role) return;
    await run("update", () => postJson(`/api/org/memberships/${person.membershipId}/role`, { role }));
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organization</p>
          <h1>People</h1>
          <p className="lede">Invite a person, set their role, or disable access. A disabled person cannot sign in.</p>
        </div>
        <details className="create-panel panel" id="invite-person">
          <summary className="primary-summary"><Plus size={14} aria-hidden />Invite</summary>
          <form onSubmit={invite} className="form-stack">
            <label><span>Email</span><Input name="email" type="email" required maxLength={200} autoComplete="off" /></label>
            <label>
              <span>Role</span>
              <select name="role" className="field" defaultValue="VIEWER" aria-label="Role for the invitation">
                {ORG_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <Button disabled={pending !== null}>{pending === "invite" ? "Inviting…" : "Send invite"}</Button>
          </form>
        </details>
      </div>
      {links.map((link) => (
        <div key={link.href} className="panel accept-once" role="status">
          <p>Accept link for {link.email}. Shown once.</p>
          <code>{link.href}</code>
          <div className="people-actions">
            <Button type="button" variant="outline" onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.href);
                setCopied(link.href);
              } catch {
                setCopied("");
              }
            }}>{copied === link.href ? "Copied" : "Copy link"}</Button>
            <Button type="button" variant="ghost" onClick={() => setLinks((current) => current.filter((item) => item.href !== link.href))}>Dismiss</Button>
          </div>
        </div>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
      {people.length === 0 ? (
        <p className="empty"><strong>No people yet</strong>Invite someone to this organization.</p>
      ) : (
        <div className="people-table-wrap">
          <table className="people-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const lastAdmin = person.role === "ORG_ADMIN" && person.status === "ACTIVE" && activeAdmins <= 1;
                return (
                  <tr key={person.membershipId}>
                    <td className="people-name">{person.name?.trim() || "—"}</td>
                    <td className="people-email">{person.email}</td>
                    <td>{ROLE_LABELS[person.role]}</td>
                    <td><Badge className={STATUS_CLASS[person.status]}>{STATUS_LABELS[person.status]}</Badge></td>
                    <td className="people-updated">{person.updatedLabel}</td>
                    <td>
                      <div className="people-actions">
                        {person.status === "DISABLED" ? (
                          <Button type="button" disabled={pending !== null} onClick={() => run("update", () => postJson(`/api/org/memberships/${person.membershipId}/enable`))}>Re-enable</Button>
                        ) : (
                          <>
                            <select
                              className="field"
                              aria-label={`Role for ${person.email}`}
                              value={person.role}
                              disabled={pending !== null || lastAdmin}
                              title={lastAdmin ? "The organization needs an active org admin." : undefined}
                              onChange={(event) => changeRole(person, event.target.value)}
                            >
                              {ORG_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                            </select>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={pending !== null || lastAdmin}
                              title={lastAdmin ? "The organization needs an active org admin." : undefined}
                              onClick={() => run("update", () => postJson(`/api/org/memberships/${person.membershipId}/disable`))}
                            >Disable</Button>
                            {person.status === "INVITED" && (
                              <Button type="button" variant="ghost" disabled={pending !== null} onClick={() => run("update", async () => {
                                const result = await postJson(`/api/org/memberships/${person.membershipId}/accept-token`);
                                if (typeof result?.acceptPath !== "string") throw new Error("Could not create the accept link.");
                                rememberLink(person.email, result.acceptPath);
                              })}>New link</Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
