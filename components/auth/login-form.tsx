"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message ?? "Could not sign in.");
      setPending(false);
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Email</span><Input name="email" type="email" autoComplete="username" required maxLength={200} /></label>
      <label><span>Password</span><Input name="password" type="password" autoComplete="current-password" required minLength={10} maxLength={200} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
