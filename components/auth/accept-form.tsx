"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState(token ? "" : "This invitation link is missing a token.");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/auth/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        password,
        name: String(form.get("name") ?? ""),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message ?? "Could not accept the invitation.");
      setPending(false);
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Your name <small>Optional</small></span><Input name="name" autoComplete="name" maxLength={120} disabled={!token} /></label>
      <label><span>Password</span><Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} disabled={!token} /></label>
      <label><span>Confirm password</span><Input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={200} disabled={!token} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending || !token}>{pending ? "Saving…" : "Accept invitation"}</Button>
    </form>
  );
}
