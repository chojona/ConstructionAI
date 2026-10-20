/**
 * Sentence text only, for the absence test. Review notes from the legal copy
 * file are not stored here. The same sentence tagged in more than one section
 * is listed once.
 */
/** Pieces long enough to be a real sentence fragment. Placeholders themselves are not publishable text. */
const minimumPieceLength = 20;

/** Split placeholder sentences so each side is checked. A whole sentence with no placeholder stays intact. */
export function unpublishedSentencePieces(sentence: string): string[] {
  return sentence
    .split(/\[PLACEHOLDER:[^\]]*\]/g)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= minimumPieceLength);
}

export const unpublishedLegalSentences = [
  "We keep these login records for up to 30 days.",
  "If a file is too large to upload, we log the project, the file size, and the time, so we can see whether the limit is causing problems. The log doesn't include the file name, its contents, or your email.",
  "The name shown on each decision comes from the signed-in account of the person who made it.",
  "One ConstructionAI administrator has an owner account in the app. It shows service health data and a list of accounts (email, company, access level, and last sign-in), and it can disable or delete accounts. The owner account doesn't open your company's files, and every owner action is logged. Outside the app, ConstructionAI staff access stored data only to carry out a removal request, fix a problem, or meet a legal requirement.",
  "We use one cookie to keep you signed in. The app also saves one thing in your browser's local storage: whether you collapsed the sidebar. We don't use advertising or tracking cookies. Fonts load from our own site, with no request to Google.",
  "To have your waitlist signup deleted, email [PLACEHOLDER: privacy contact email] from the address you signed up with. We remove the signup and any optional answers by hand.",
  "You can delete your account. Deleting it removes your login, email address, sessions, and company memberships. Files you uploaded, review decisions, and packs stay with your company, because they're part of its project records, and your company may need to keep them for years. Past review decisions keep your name as it appeared when you made them, but it's no longer linked to an account.",
  "Deleting your account doesn't delete files or records you added to a project.",
  "We can remove files on request, and we'll confirm in writing when it's done.",
  "Removing a file also removes it from any pack stored in ConstructionAI. Copies you've already downloaded or shared aren't affected.",
  "Backups and database history may keep copies for [PLACEHOLDER: period] after we remove a file.",
  "We won't sell Your Content, share it with another customer, or use it to train AI models.",
  "Deleting your account removes your login and account details but not the files, review decisions, or packs you added, which stay with your company as project records.",
] as const;
