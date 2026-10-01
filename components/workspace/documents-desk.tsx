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

  const lead = documents[0]!;
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
        <div className="document-rail-copy">
          <p className="row-meta">Latest document</p>
          <p className="row-title">{lead.title}</p>
          <p className="row-meta">{lead.documentType || "Unclassified document"}</p>
          <p className="row-meta">{lead.revisionCount} {lead.revisionCount === 1 ? "revision" : "revisions"}</p>
        </div>
      </aside>
    </div>
  );
}
