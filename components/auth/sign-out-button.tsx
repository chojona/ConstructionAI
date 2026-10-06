"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <form action="/api/auth/logout" method="post" onSubmit={signOut}>
      <button type="submit" className="text-button" disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}
