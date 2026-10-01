"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateDocumentForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/projects/${projectId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: form.get("title"), documentType: form.get("documentType") }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message ?? "Could not create document.");
      setPending(false);
      return;
    }
    router.push(`/documents/${result.document.id}`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Document title</span><Input name="title" required maxLength={200} placeholder="Drainage Plan" /></label>
      <label><span>Document type <small>Optional</small></span><Input name="documentType" maxLength={80} placeholder="Plan set" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Adding…" : "Add document"}</Button>
    </form>
  );
}
