"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EmptySolidCard } from "@/components/workspace/empty-solid-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MEMBERSHIP_STATUS_LABEL,
  ORG_ROLE_LABEL,
  ORG_ROLES,
  membershipStatusClass,
  type MembershipStatus,
  type OrgRole,
} from "@/lib/auth/roles";

export interface PeopleRow {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  status: MembershipStatus;
  updatedLabel: string;
}

function personName(person: Pick<PeopleRow, "name" | "email">) {
  const name = person.name?.trim();
  return name || person.email;
}

function roleIsReadOnly(row: PeopleRow, rows: readonly PeopleRow[]) {
  if (row.role !== "ORG_ADMIN" || row.status !== "ACTIVE") return false;
  return rows.filter((item) => item.role === "ORG_ADMIN" && item.status === "ACTIVE").length <= 1;
}

export function PeopleDesk({ people, currentUserId }: { people: PeopleRow[]; currentUserId: string }) {
  const router = useRouter();
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const disableDialog = useRef<HTMLDialogElement>(null);
  const propKey = people.map((person) => `${person.membershipId}:${person.role}:${person.status}:${person.updatedLabel}`).join("|");
  const [seenProp, setSeenProp] = useState(propKey);
  const [rows, setRows] = useState(people);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [issued, setIssued] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [disableRow, setDisableRow] = useState<PeopleRow | null>(null);
  const [disableError, setDisableError] = useState("");
  const [disablePending, setDisablePending] = useState(false);

  if (seenProp !== propKey) {
    setSeenProp(propKey);
    setRows(people);
  }

  const others = rows.filter((row) => row.userId !== currentUserId);

  function openInvite() {
    setInviteError("");
    inviteDialog.current?.showModal();
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setInvitePending(true);
    setInviteError("");
    const form = new FormData(formElement);
    const response = await fetch("/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), role: form.get("role") }),
    });
    const result = await response.json();
    setInvitePending(false);
    if (!response.ok) {
      setInviteError(result.error?.message ?? "Could not invite that person.");
      return;
    }
    const path = typeof result.membership?.acceptPath === "string" ? result.membership.acceptPath : "";
    if (!path) {
      setInviteError("The invite was created, but no accept link came back.");
      return;
    }
    formElement.reset();
    inviteDialog.current?.close();
    setCopied(false);
    setIssued({ url: new URL(path, window.location.origin).toString() });
    router.refresh();
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Could not copy the link. Select it and copy it yourself.");
    }
  }

  async function changeRole(row: PeopleRow, role: OrgRole) {
    if (role === row.role) return;
    setPendingId(row.membershipId);
    setError("");
    const response = await fetch(`/api/org/memberships/${row.membershipId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const result = await response.json();
    setPendingId("");
    if (!response.ok) {
      setError(result.error?.message ?? "Could not change that role.");
      return;
    }
    setRows((current) => current.map((item) => item.membershipId === row.membershipId ? { ...item, role } : item));
    router.refresh();
  }

  function askDisable(row: PeopleRow) {
    setDisableRow(row);
    setDisableError("");
    disableDialog.current?.showModal();
  }

  async function confirmDisable() {
    if (!disableRow) return;
    setDisablePending(true);
    setDisableError("");
    const response = await fetch(`/api/org/memberships/${disableRow.membershipId}/disable`, { method: "POST" });
    const result = await response.json();
    setDisablePending(false);
    if (!response.ok) {
      setDisableError(result.error?.message ?? "Could not disable that person.");
      return;
    }
    const status = result.membership?.status === "DISABLED" ? "DISABLED" : disableRow.status;
    setRows((current) => current.map((item) => item.membershipId === disableRow.membershipId ? { ...item, status } : item));
    disableDialog.current?.close();
    router.refresh();
  }

  async function enable(row: PeopleRow) {
    setPendingId(row.membershipId);
    setError("");
    const response = await fetch(`/api/org/memberships/${row.membershipId}/enable`, { method: "POST" });
    const result = await response.json();
    setPendingId("");
    if (!response.ok) {
      setError(result.error?.message ?? "Could not re-enable that person.");
      return;
    }
    const status: MembershipStatus = result.membership?.status === "INVITED" || result.membership?.status === "ACTIVE"
      ? result.membership.status
      : "ACTIVE";
    setRows((current) => current.map((item) => item.membershipId === row.membershipId ? { ...item, status } : item));
    router.refresh();
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organization</p>
          <h1>People</h1>
        </div>
        <Button type="button" onClick={openInvite}>Invite person</Button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {issued ? (
        <section className="panel people-accept" aria-live="polite">
          <Input readOnly value={issued.url} aria-label="Accept link" onFocus={(event) => event.currentTarget.select()} />
          <div className="people-dialog-actions">
            <Button type="button" variant="outline" onClick={copyLink}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="field-help">Shown once. Send it to them directly.</p>
        </section>
      ) : null}
      {others.length === 0 ? (
        <EmptySolidCard message="Only you so far">
          <Button type="button" onClick={openInvite}>Invite person</Button>
        </EmptySolidCard>
      ) : (
        <div className="register-table-wrap">
          <table className="document-table people-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col"><span className="sr-only">Access</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name = personName(row);
                const readOnly = roleIsReadOnly(row, rows);
                const busy = pendingId === row.membershipId;
                return (
                  <tr key={row.membershipId}>
                    <td className="col-person">
                      <span className="row-title">{name}</span>
                      {row.name?.trim() ? <p className="row-meta">{row.email}</p> : null}
                    </td>
                    <td className="col-role">
                      {readOnly ? (
                        <Badge>{ORG_ROLE_LABEL[row.role]}</Badge>
                      ) : (
                        <select
                          className="field people-role"
                          aria-label={`Role for ${name}`}
                          value={row.role}
                          disabled={busy}
                          onChange={(event) => {
                            const role = ORG_ROLES.find((item) => item === event.target.value);
                            if (role) void changeRole(row, role);
                          }}
                        >
                          {ORG_ROLES.map((role) => <option key={role} value={role}>{ORG_ROLE_LABEL[role]}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="col-status">
                      <Badge className={membershipStatusClass(row.status)}>{MEMBERSHIP_STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="col-updated">{row.updatedLabel}</td>
                    <td className="col-access">
                      {row.status === "DISABLED" ? (
                        <Button type="button" variant="outline" disabled={busy} onClick={() => void enable(row)}>Re-enable</Button>
                      ) : readOnly ? null : (
                        <Button type="button" variant="danger" disabled={busy} onClick={() => askDisable(row)}>Disable</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <dialog ref={inviteDialog} className="command-dialog" aria-labelledby="invite-title" onClick={(event) => { if (event.target === event.currentTarget) inviteDialog.current?.close(); }}>
        <div className="command-heading">
          <h2 id="invite-title">Invite person</h2>
          <button type="button" className="icon-button" aria-label="Close invite" onClick={() => inviteDialog.current?.close()}><X size={17} /></button>
        </div>
        <form className="form-stack people-dialog-body" onSubmit={submitInvite}>
          <label><span>Email</span><Input name="email" type="email" required maxLength={200} autoComplete="off" /></label>
          <label>
            <span>Role</span>
            <select name="role" className="field" defaultValue="VIEWER" aria-label="Role">
              {ORG_ROLES.map((role) => <option key={role} value={role}>{ORG_ROLE_LABEL[role]}</option>)}
            </select>
          </label>
          {inviteError ? <p className="form-error" role="alert">{inviteError}</p> : null}
          <div className="people-dialog-actions">
            <Button type="button" variant="outline" onClick={() => inviteDialog.current?.close()}>Cancel</Button>
            <Button type="submit" disabled={invitePending}>{invitePending ? "Inviting…" : "Invite person"}</Button>
          </div>
        </form>
      </dialog>
      <dialog ref={disableDialog} className="command-dialog" aria-labelledby="disable-title" onClick={(event) => { if (event.target === event.currentTarget) disableDialog.current?.close(); }}>
        <div className="command-heading">
          <h2 id="disable-title">Disable {disableRow ? personName(disableRow) : "this person"}?</h2>
          <button type="button" className="icon-button" aria-label="Close disable confirmation" onClick={() => disableDialog.current?.close()}><X size={17} /></button>
        </div>
        <div className="people-dialog-body">
          <p>They lose access on their next request.</p>
          {disableError ? <p className="form-error" role="alert">{disableError}</p> : null}
          <div className="people-dialog-actions">
            <Button type="button" variant="outline" onClick={() => disableDialog.current?.close()}>Cancel</Button>
            <Button type="button" variant="danger" disabled={disablePending} onClick={() => void confirmDisable()}>{disablePending ? "Disabling…" : "Disable"}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
