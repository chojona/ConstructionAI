"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UPLOAD_HELPER_TEXT, UPLOAD_TOO_LARGE_MESSAGE, completeUploadAttempt, uploadFileTooLarge } from "@/lib/documents/uploadLimit";

export function CreateDocumentForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    const form = new FormData(formElement);
    const rawFile = form.get("file");
    const file = rawFile instanceof File ? rawFile : null;
    try {
      if (uploadFileTooLarge(file)) {
        setError(UPLOAD_TOO_LARGE_MESSAGE);
        return;
      }
      let id = documentId;
      if (!id) {
        const created = await completeUploadAttempt({
          file: null,
          fallbackError: "Could not create document.",
          send: () => fetch(`/api/projects/${projectId}/documents`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: form.get("title"), documentType: form.get("documentType") }),
          }),
        });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        const document = created.body && typeof created.body === "object"
          ? (created.body as { document?: { id?: unknown } }).document
          : null;
        id = document && typeof document.id === "string" ? document.id : "";
        if (!id) {
          setError("Could not create document.");
          return;
        }
        setDocumentId(id);
      }
      const revision = new FormData();
      revision.set("revisionLabel", String(form.get("revisionLabel") ?? ""));
      if (file) revision.set("file", file);
      const uploaded = await completeUploadAttempt({
        file,
        fallbackError: "Could not upload revision.",
        send: () => fetch(`/api/documents/${id}/revisions`, { method: "POST", body: revision }),
      });
      if (!uploaded.ok) {
        setError(uploaded.error);
        return;
      }
      formElement.reset();
      setDocumentId(null);
      const panel = document.getElementById("add-document");
      if (panel instanceof HTMLDetailsElement) panel.open = false;
      router.push(`/projects/${projectId}?view=documents`);
      router.refresh();
    } catch {
      setError("Could not create document.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Document title</span><Input name="title" required maxLength={200} placeholder="Drainage Plan" /></label>
      <label><span>Document type <small>Optional</small></span><Input name="documentType" maxLength={80} placeholder="Plan set" /></label>
      <label><span>Revision label</span><Input name="revisionLabel" required maxLength={80} placeholder="Revision A" /></label>
      <label><span>PDF file</span><Input name="file" type="file" accept="application/pdf,.pdf" required /></label>
      <p className="field-help">{UPLOAD_HELPER_TEXT}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Adding…" : "Add document"}</Button>
    </form>
  );
}
