export interface EvidenceLocation {
  documentPageId: string | null;
  pageNumber: number;
  excerpt: string;
  startOffset: number;
  endOffset: number;
  revisionId: string;
  revisionLabel: string;
  documentTitle: string;
}

export interface EvidenceTarget {
  pageId: string;
  start: number;
  end: number;
  excerpt: string;
}

export function findingDomId(subjectKey: string) {
  const bytes = new TextEncoder().encode(subjectKey);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `finding-${token}`;
}

export function decisionReturnPath(projectId: string, subjectKey: string) {
  return `/projects/${projectId}#${findingDomId(subjectKey)}`;
}

export function evidenceHref(evidence: EvidenceLocation, returnTo: string) {
  if (!evidence.documentPageId || !Number.isInteger(evidence.startOffset) || !Number.isInteger(evidence.endOffset)) return null;
  const params = new URLSearchParams({
    page: evidence.documentPageId,
    start: String(evidence.startOffset),
    end: String(evidence.endOffset),
    quote: evidence.excerpt,
    return: returnTo,
  });
  return `/revisions/${encodeURIComponent(evidence.revisionId)}?${params.toString()}#evidence`;
}

export function safeReturnPath(value: string | undefined) {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/projects/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("://") || decoded.includes("?")) return null;
  const hashAt = decoded.indexOf("#");
  const path = hashAt === -1 ? decoded : decoded.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : decoded.slice(hashAt);
  if (!/^\/projects\/[A-Za-z0-9_-]+$/.test(path)) return null;
  if (hash && (!hash.startsWith("#finding-") || /[\u0000-\u001f]/.test(hash))) return null;
  return decoded;
}

export function parseEvidenceTarget(query: { page?: string; start?: string; end?: string; quote?: string }): EvidenceTarget | null {
  if (!query.page || query.start === undefined || query.end === undefined || query.quote === undefined) return null;
  if (!/^\d+$/.test(query.start) || !/^\d+$/.test(query.end)) return null;
  return { pageId: query.page, start: Number(query.start), end: Number(query.end), excerpt: query.quote };
}

/** Highlight only when the stored offsets reproduce the excerpt. Repeated copies stay distinct. */
export function locateEvidenceSpan(pageText: string, startOffset: number, endOffset: number, excerpt: string) {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) return null;
  if (startOffset < 0 || endOffset > pageText.length || startOffset >= endOffset) return null;
  if (pageText.slice(startOffset, endOffset) !== excerpt) return null;
  return { start: startOffset, end: endOffset };
}

export function pageSegments(pageText: string, span: { start: number; end: number } | null) {
  if (!span) return [{ text: pageText, hit: false }];
  return [
    { text: pageText.slice(0, span.start), hit: false },
    { text: pageText.slice(span.start, span.end), hit: true },
    { text: pageText.slice(span.end), hit: false },
  ].filter((segment) => segment.text.length > 0);
}
