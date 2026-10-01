export function projectNumberLabel(projectNumber: string | null | undefined) {
  const value = projectNumber?.trim();
  return value || "No project number";
}

export function projectCardMeta(documentCount: number, openCount: number) {
  const docs = documentCount === 1 ? "1 doc" : `${documentCount} docs`;
  const status = openCount === 0 ? "All clear" : `${openCount} open`;
  return `${docs} · ${status}`;
}
