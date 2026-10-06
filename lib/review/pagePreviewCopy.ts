export const PAGE_PREVIEW_UNAVAILABLE_MESSAGE = "Page preview unavailable — open full document.";
export const PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE = "Page preview unavailable — showing extracted text.";
export const PAGE_PREVIEW_OPEN_LABEL = "Open full document";

const UNLINKED_EXCERPT = new Set(["No linked excerpt available.", "No linked excerpt for this item."]);

/** True when the row shows a real excerpt, not an empty or placeholder cite. */
export function hasLinkedPreviewExcerpt(excerpt: string | null | undefined) {
  const text = excerpt?.trim() ?? "";
  return text.length > 0 && !UNLINKED_EXCERPT.has(text);
}

export function previewFailureMessage(body: unknown, hasLinkedExcerpt: boolean) {
  if (!hasLinkedExcerpt) return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
  if (!body || typeof body !== "object" || !("error" in body)) return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error)) return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
  if (error.code === "PAGE_PREVIEW_TEXT_UNAVAILABLE") return PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE;
  return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
}
