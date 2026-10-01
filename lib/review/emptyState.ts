export function uploadRevisionHref(
  projectId: string,
  documents: readonly { id: string; revisionCount: number }[],
) {
  const target = documents.find((document) => document.revisionCount === 0) ?? documents[0];
  if (!target) return `/projects/${projectId}?view=documents`;
  return `/documents/${target.id}?upload=1`;
}

export function portfolioUploadHref(projects: readonly { id: string; documentCount: number }[]) {
  const blank = projects.find((project) => project.documentCount === 0);
  if (blank) return `/projects/${blank.id}?view=documents`;
  const first = projects[0];
  if (!first) return "/projects";
  return `/projects/${first.id}?view=documents`;
}
