import Link from "next/link";
import { EmptySolidCard } from "@/components/workspace/empty-solid-card";

export function DocumentsDesk({
  projectId,
  documents,
}: {
  projectId: string;
  documents: readonly { id: string; title: string; documentType: string | null; revisionCount: number }[];
}) {
  if (!documents.length) {
    return (
      <EmptySolidCard
        message="No documents yet"
        action={{ href: `/projects/${projectId}?view=documents#add-document`, label: "Add document" }}
      />
    );
  }

  return (
    <div className="document-desk">
      <div className="list document-list">
        {documents.map((document) => (
          <Link className="list-row" href={`/documents/${document.id}`} key={document.id}>
            <div>
              <p className="row-title">{document.title}</p>
              <p className="row-meta">{document.documentType || "Unclassified document"}</p>
            </div>
            <div className="row-side">
              <span>{document.revisionCount} {document.revisionCount === 1 ? "revision" : "revisions"}</span>
            </div>
          </Link>
        ))}
      </div>
      <aside className="document-rail" aria-label="Document preview">
        <p className="rail-empty">Select a document</p>
      </aside>
    </div>
  );
}
