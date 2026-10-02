/** Meta line for a documents-list row. A missing type is omitted, never replaced with a placeholder. */
export function documentRowMeta(documentType: string | null | undefined): string | null {
  const type = documentType?.trim() ?? "";
  return type.length > 0 ? type : null;
}

/** Eyebrow identity. Uses the document type only when one is set. */
export function documentIdentity(documentType: string | null | undefined, context: string): string {
  const type = documentRowMeta(documentType);
  return type ? `${type} · ${context}` : context;
}
