"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AddDocumentDeskButton } from "@/components/workspace/add-document-button";
import { EmptySolidCard } from "@/components/workspace/empty-solid-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { documentRowMeta } from "@/lib/documents/documentDesk";
import {
  documentTypeOptions,
  emptyRegisterQuery,
  filterRegisterRows,
  latestRevision,
  REGISTER_STATUSES,
  registerQueryKey,
  registerQueryString,
  registerRows,
  registerStatusClass,
  type RegisterDocumentDto,
  type RegisterQuery,
  type RegisterRow,
} from "@/lib/documents/documentRegister";

export function DocumentsDesk({
  documents,
  query,
}: {
  documents: readonly RegisterDocumentDto[];
  query: RegisterQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const signature = registerQueryKey(query);
  const [seen, setSeen] = useState(signature);
  const [local, setLocal] = useState(query);
  if (seen !== signature) {
    setSeen(signature);
    setLocal(query);
  }

  if (!documents.length) {
    return (
      <EmptySolidCard message="No documents yet">
        <AddDocumentDeskButton />
      </EmptySolidCard>
    );
  }

  const types = documentTypeOptions(documents);
  const rows = filterRegisterRows(registerRows(documents, local.revision), local);
  const selectedDocument = documents.find((document) => document.id === local.documentId && rows.some((row) => row.documentId === document.id)) ?? null;
  const selectedRow = selectedDocument
    ? rows.find((row) => row.documentId === selectedDocument.id && row.revisionId === local.revisionId)
      ?? rows.find((row) => row.documentId === selectedDocument.id && row.isLatest)
      ?? rows.find((row) => row.documentId === selectedDocument.id)
      ?? null
    : null;

  function commit(next: RegisterQuery) {
    setLocal(next);
    const serialized = registerQueryString(new URLSearchParams(window.location.search), next);
    router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
  }

  function select(row: RegisterRow) {
    commit({ ...local, documentId: row.documentId, revisionId: row.revisionId });
  }

  function openDocument(documentId: string) {
    router.push(`/documents/${documentId}`);
  }

  return (
    <div className="document-desk">
      <div className="register-filters">
        <label className="register-filter register-filter-search">
          <span>Title</span>
          <Input
            value={local.query}
            onChange={(event) => commit({ ...local, query: event.target.value })}
            placeholder="Search titles"
            aria-label="Search document titles"
          />
        </label>
        <label className="register-filter">
          <span>Type</span>
          <select
            className="field"
            value={local.type ?? ""}
            aria-label="Type"
            onChange={(event) => commit({ ...local, type: event.target.value || null })}
          >
            <option value="">All</option>
            {local.type && !types.includes(local.type) ? <option value={local.type}>{local.type}</option> : null}
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="register-filter">
          <span>Status</span>
          <select
            className="field"
            value={local.status ?? ""}
            aria-label="Status"
            onChange={(event) => commit({
              ...local,
              status: REGISTER_STATUSES.find((status) => status === event.target.value) ?? null,
            })}
          >
            <option value="">All</option>
            {REGISTER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="register-filter">
          <span>Revision</span>
          <select
            className="field"
            value={local.revision}
            aria-label="Revision"
            onChange={(event) => commit({ ...local, revision: event.target.value === "all" ? "all" : "latest" })}
          >
            <option value="latest">Latest</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptySolidCard message="No documents match">
          <button type="button" className="primary-link register-hit" onClick={() => commit(emptyRegisterQuery())}>Clear filters</button>
        </EmptySolidCard>
      ) : (
        <div className="document-register">
          <div className="register-table-wrap">
            <table className="document-table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Rev</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const type = documentRowMeta(row.documentType);
                  const selected = selectedRow?.key === row.key;
                  return (
                    <tr
                      key={row.key}
                      id={`document-row-${row.key}`}
                      className={selected ? "is-selected" : undefined}
                      aria-selected={selected}
                      tabIndex={selected || (!selectedRow && index === 0) ? 0 : -1}
                      onClick={() => select(row)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter") {
                          event.preventDefault();
                          openDocument(row.documentId);
                        } else if (event.key === " ") {
                          event.preventDefault();
                          select(row);
                        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
                          if (!next) return;
                          select(next);
                          document.getElementById(`document-row-${next.key}`)?.focus();
                        }
                      }}
                    >
                      <td className="col-document">
                        <Link href={`/documents/${row.documentId}`} onClick={(event) => event.stopPropagation()}>{row.title}</Link>
                        {type ? <p className="row-meta">{type}</p> : null}
                      </td>
                      <td className="col-rev">{row.revisionLabel ?? "—"}</td>
                      <td className="col-status">
                        {row.status ? <Badge className={registerStatusClass(row.status)}>{row.status}</Badge> : "—"}
                      </td>
                      <td className="col-updated">{row.updatedLabel ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DocumentRegisterPanel document={selectedDocument} />
        </div>
      )}
    </div>
  );
}

function DocumentRegisterPanel({ document }: { document: RegisterDocumentDto | null }) {
  const latest = document ? latestRevision(document.revisions) : null;
  const type = document ? documentRowMeta(document.documentType) : null;
  return (
    <aside className="evidence-rail" aria-label="Selected document">
      {document ? (
        <>
          <div className="evidence-rail-body">
            {type ? <p className="row-meta">{type}</p> : null}
            <h3>{document.title}</h3>
            <p className="row-meta">{latest ? `Rev ${latest.revisionLabel}` : "No revisions yet"}</p>
            {document.issuedLabel ? <p className="register-issued">{document.issuedLabel}</p> : null}
            <dl className="register-counts">
              <div><dt>Open changes</dt><dd>{document.openChangeCount}</dd></div>
              <div><dt>Revisions</dt><dd>{document.revisions.length}</dd></div>
              <div><dt>Pages</dt><dd>{latest?.pageCount ?? 0}</dd></div>
            </dl>
          </div>
          <div className="decision-sticky">
            <Link className="primary-link register-hit" href={`/documents/${document.id}`}>Open document</Link>
          </div>
        </>
      ) : <p className="rail-empty">Select a document</p>}
    </aside>
  );
}
