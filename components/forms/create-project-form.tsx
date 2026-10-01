"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateProjectForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), projectNumber: form.get("projectNumber") }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message ?? "Could not create project.");
      setPending(false);
      return;
    }
    router.push(`/projects/${result.project.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Project name</span><Input name="name" required maxLength={160} /></label>
      <label><span>Project number <small>Optional</small></span><Input name="projectNumber" maxLength={80} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Creating…" : "Create project"}</Button>
    </form>
  );
}
