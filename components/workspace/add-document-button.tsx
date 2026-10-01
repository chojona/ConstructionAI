"use client";

export function AddDocumentDeskButton() {
  return (
    <button type="button" className="primary-link" aria-controls="add-document" onClick={openAddDocument}>
      Add document
    </button>
  );
}

function openAddDocument() {
  const panel = document.getElementById("add-document");
  if (!(panel instanceof HTMLDetailsElement)) return;
  panel.open = true;
  panel.querySelector<HTMLInputElement>("input[name='title']")?.focus();
  panel.scrollIntoView({ block: "nearest" });
}
