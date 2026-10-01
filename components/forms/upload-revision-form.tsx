"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UploadRevisionForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/documents/${documentId}/revisions`, { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message ?? "Could not upload revision.");
      setPending(false);
      return;
    }
    router.push(`/revisions/${result.revision.id}`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Revision label</span><Input name="revisionLabel" required maxLength={80} placeholder="Revision C" /></label>
      <label><span>PDF file</span><Input name="file" type="file" accept="application/pdf,.pdf" required /></label>
      <p className="field-help">PDF only, up to 20 MB. The file needs selectable text.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Processing…" : "Upload revision"}</Button>
    </form>
  );
}
