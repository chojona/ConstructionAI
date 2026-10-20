/** Login-record bullet: the tagged "up to 30 days" sentence stays off the page. */
export const loginRecordFallback = "We keep these records until we add automatic deletion.";

export const loginRecordUnpublished = "We keep these login records for up to 30 days.";

export const cardBText = "Check your installed quantities against the DOT's monthly pay estimate. Gaps are flagged with their source page.";

export const cardBCaption = "You review and approve every line before it's used in a pay request. This isn't legal or claims advice.";

export const cardAText = "Upload your plan set and addenda. See which sheet revision is current, with the source page for each.";

export const consentError = "Check the box to agree to the Terms and Privacy Policy.";

export const consentNotice = "We'll email you about the waitlist and pilot. You can unsubscribe anytime.";

export const consentVersionNote = "We record the date you agreed and the version of the Terms and Privacy Policy you agreed to. One version number covers both documents.";

export const consentHelper = "We use your details to contact you about the pilot, and to send product updates only if you ask for them.";

export const draftBanner = "Draft. Not yet reviewed by an attorney.";

export const legalVersion = "v0.1-draft";

const bannedPrefixes = ["[PLACEHOLDER", "[CTO", "[DO NOT PUBLISH", "[NOTE", "[ATTORNEY", "[UPDATE", "[EFFECTIVE DATE", "[YEAR"] as const;

const bannedLiterals = ["CTO CONFIRM", "CTO RESULT", "DO NOT PUBLISH", "PLACEHOLDER", "ATTORNEY QUESTION"] as const;

/** Tags and bracketed blanks that must never ship in legal HTML. */
export function findLegalCopyViolations(html: string): string[] {
  const hits: string[] = [];
  for (const prefix of bannedPrefixes) {
    if (html.includes(prefix)) hits.push(prefix);
  }
  for (const literal of bannedLiterals) {
    if (html.includes(literal)) hits.push(literal);
  }
  for (const match of html.match(/\[[^\]\n]+\]/g) ?? []) {
    hits.push(match);
  }
  return hits;
}

export function doNotPublishLines(markdown: string): string[] {
  return markdown.split(/\r?\n/).filter((line) => line.includes("[DO NOT PUBLISH"));
}

/** Sentence that must not appear for one DO NOT PUBLISH source line. */
export function prohibitedPhrase(line: string): string {
  const before = line.split("[DO NOT PUBLISH")[0] ?? "";
  if (before.includes(loginRecordUnpublished)) return loginRecordUnpublished;
  return before
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[PLACEHOLDER:[^\]]*\]/g, "")
    .replace(/^[\s>*-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}
