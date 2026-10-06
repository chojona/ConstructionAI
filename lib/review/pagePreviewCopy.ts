export const PAGE_PREVIEW_UNAVAILABLE_MESSAGE = "Page preview unavailable — open full document.";
export const PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE = "Preview couldn't draw this page's text. The extracted text is still available.";
export const PAGE_PREVIEW_OPEN_LABEL = "Open full document";

export function previewFailureMessage(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error)) return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
  if (error.code === "PAGE_PREVIEW_TEXT_UNAVAILABLE") return PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE;
  return PAGE_PREVIEW_UNAVAILABLE_MESSAGE;
}
