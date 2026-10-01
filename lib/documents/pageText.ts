/**
 * Conservative cleanup of extractor artifacts. Words, punctuation, and
 * meaningful line breaks remain untouched.
 */
export function normalizePageText(value: string): string {
  return value
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasUsableText(pages: Array<{ text: string }>): boolean {
  return pages.some((page) => page.text.replace(/\s+/g, "").length > 0);
}
