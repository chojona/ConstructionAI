"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UPLOAD_HELPER_TEXT, completeUploadAttempt } from "@/lib/documents/uploadLimit";

export function UploadRevisionForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const raw = body.get("file");
    setPending(true);
    setError("");
    try {
      const outcome = await completeUploadAttempt({
        file: raw instanceof File ? raw : null,
        fallbackError: "Could not upload revision.",
        send: () => fetch(`/api/documents/${documentId}/revisions`, { method: "POST", body }),
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const revision = outcome.body && typeof outcome.body === "object"
        ? (outcome.body as { revision?: { id?: unknown } }).revision
        : null;
      const revisionId = revision && typeof revision.id === "string" ? revision.id : "";
      if (!revisionId) {
        setError("Could not upload revision.");
        return;
      }
      router.push(`/revisions/${revisionId}`);
      router.refresh();
    } catch {
      setError("Could not upload revision.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Revision label</span><Input name="revisionLabel" required maxLength={80} placeholder="Revision C" /></label>
      <label><span>PDF file</span><Input name="file" type="file" accept="application/pdf,.pdf" required /></label>
      <p className="field-help">{UPLOAD_HELPER_TEXT}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Processing…" : "Upload revision"}</Button>
    </form>
  );
}
