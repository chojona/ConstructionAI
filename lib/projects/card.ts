export function projectNumberLabel(projectNumber: string | null | undefined) {
  const value = projectNumber?.trim();
  return value || "No project number";
}

export function projectDocumentsLabel(documentCount: number) {
  return documentCount === 1 ? "1 doc" : `${documentCount} docs`;
}

export function projectStatusLabel(openCount: number) {
  return openCount === 0 ? "All clear" : `${openCount} open`;
}
