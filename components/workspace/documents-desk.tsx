import Link from "next/link";
import { AddDocumentDeskButton } from "@/components/workspace/add-document-button";
import { EmptySolidCard } from "@/components/workspace/empty-solid-card";
import { documentRowMeta } from "@/lib/documents/documentDesk";

export function DocumentsDesk({
  documents,
}: {
  documents: readonly { id: string; title: string; documentType: string | null; revisionCount: number }[];
}) {
  if (!documents.length) {
    return (
      <EmptySolidCard message="No documents yet">
        <AddDocumentDeskButton />
      </EmptySolidCard>
    );
  }

  return (
    <div className="document-desk">
      <div className="list document-list">
        {documents.map((document) => {
          const type = documentRowMeta(document.documentType);
          return (
            <Link className="list-row" href={`/documents/${document.id}`} key={document.id}>
              <div>
                <p className="row-title">{document.title}</p>
                {type ? <p className="row-meta">{type}</p> : null}
              </div>
              <div className="row-side">
                <span>{document.revisionCount} {document.revisionCount === 1 ? "revision" : "revisions"}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
