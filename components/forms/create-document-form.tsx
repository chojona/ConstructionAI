"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    try {
      let id = documentId;
      if (!id) {
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
        id = result.document.id as string;
        setDocumentId(id);
      }
      const revision = new FormData();
      revision.set("revisionLabel", String(form.get("revisionLabel") ?? ""));
      const file = form.get("file");
      if (file instanceof File) revision.set("file", file);
      const uploaded = await fetch(`/api/documents/${id}/revisions`, { method: "POST", body: revision });
      const uploadedResult = await uploaded.json();
      if (!uploaded.ok) {
        setError(uploadedResult.error?.message ?? "Could not upload revision.");
        setPending(false);
        return;
      }
      formElement.reset();
      setDocumentId(null);
      setPending(false);
      const panel = document.getElementById("add-document");
      if (panel instanceof HTMLDetailsElement) panel.open = false;
      router.push(`/projects/${projectId}?view=documents`);
      router.refresh();
    } catch {
      setError("Could not create document.");
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label><span>Document title</span><Input name="title" required maxLength={200} placeholder="Drainage Plan" /></label>
      <label><span>Document type <small>Optional</small></span><Input name="documentType" maxLength={80} placeholder="Plan set" /></label>
      <label><span>Revision label</span><Input name="revisionLabel" required maxLength={80} placeholder="Revision A" /></label>
      <label><span>PDF file</span><Input name="file" type="file" accept="application/pdf,.pdf" required /></label>
      <p className="field-help">PDF only, up to 20 MB. The file needs selectable text.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button disabled={pending}>{pending ? "Adding…" : "Add document"}</Button>
    </form>
  );
}
