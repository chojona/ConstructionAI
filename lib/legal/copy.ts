/** Publishable legal strings. Internal review notes stay out of this module. */

export const loginRecordFallback = "We keep these records until we add automatic deletion.";

export const cardBText = "Check your installed quantities against the DOT's monthly pay estimate. Gaps are flagged with their source page.";

export const cardBCaption = "You review and approve every line before it's used in a pay request. This isn't legal or claims advice.";

export const cardAText = "One page that shows the current revision of every sheet on the job, with its source, ready to send to the field.";

export const consentError = "Check the box to agree to the Terms and Privacy Policy.";

export const emailFieldError = "Enter your work email.";

export const companyFieldError = "Enter your company.";

export const roleFieldError = "Choose your role.";

export const dotFieldError = "Choose Yes or No.";

export const consentNotice = "We'll email you about the waitlist and pilot. You can unsubscribe anytime.";

export const consentUpdates = "Email me product updates.";

export const consentVersionNote = "We record the date you agreed and the version of the Terms and Privacy Policy you agreed to. One version number covers both documents.";

export const consentHelper = "We use your details to contact you about the pilot, and to send product updates only if you ask for them.";

export const draftBanner = "DRAFT — pending attorney review";

export const legalVersion = "v0.1-draft";

export const privacyTitle = "Privacy and data deletion note";

export const termsTitle = "Pilot terms of use";

export const waitlistSignupSource = "which page you signed up from and which offer you picked";

export const optionalQuestionCount = "After you sign up, you can answer up to five optional questions about your work. You can skip them.";

export const noPhoneOrUploads = "We don't ask for a phone number on the waitlist, and we don't accept file uploads there.";

export const filesYouUploadLead = "PDF files (for example plan sets and specs), Bluebeam markup summaries as PDF or CSV files, the original file name, the document title and revision label you enter, and the text we read from each PDF page.";

export const hostingRequestLogs = "Our hosting provider (Vercel) keeps standard request logs, including IP address, to run and secure the service.";

export const bluebeamCsvLead = "CSV markup summaries you upload can include";

export const privacyFileDeletion = "The app keeps project records, including uploaded files, as a fixed history, so a pack can always be traced to its source. ConstructionAI doesn't have a way to delete files in the app yet. To ask us to remove a file, or to erase your company's data (for example when your company leaves the pilot), email";

export const termsFileDeletion = "ConstructionAI keeps a fixed history of uploads and decisions, so a pack can always be traced to its source. ConstructionAI doesn't have a way to delete files in the app yet. To ask us to remove or erase files, for example after an upload by mistake or when your company leaves the pilot, email";

export const landingEyebrow = "Pilot waitlist";

export const landingHeadline = "Know which sheet is current, and where every number came from.";

export const optionOneLabel = "Option 1";

export const optionTwoLabel = "Option 2";

export const pilotFeatureLabel = "Pilot feature";

export const joinWaitlistLabel = "Join the waitlist";

export const waitlistDialogTitle = "Join the pilot waitlist";

export const waitlistCloseLabel = "Close";

export const waitlistPickedPrefix = "You picked:";

export const waitlistRequired = "All fields are required.";

export const waitlistInstruction = "Fill in your work email, company and role.";

export const waitlistWorkEmailLabel = "Work email";

export const waitlistEmailPlaceholder = "name@company.com";

export const waitlistCompanyLabel = "Company";

export const waitlistCompanyPlaceholder = "Company name";

export const waitlistRoleLabel = "Role";

export const waitlistRolePlaceholder = "Select your role";

export const waitlistDotLegend = "Does your company bid DOT or heavy civil work?";

export const waitlistYes = "Yes";

export const waitlistNo = "No";

/** Landing and waitlist dialog strings the client page renders and the publish scan must see. */
export function landingAndDialogText(): string {
  return [
    landingEyebrow,
    landingHeadline,
    optionOneLabel,
    cardAText,
    optionTwoLabel,
    pilotFeatureLabel,
    cardBText,
    cardBCaption,
    joinWaitlistLabel,
    waitlistDialogTitle,
    waitlistCloseLabel,
    waitlistPickedPrefix,
    waitlistRequired,
    waitlistInstruction,
    waitlistWorkEmailLabel,
    waitlistEmailPlaceholder,
    waitlistCompanyLabel,
    waitlistCompanyPlaceholder,
    waitlistRoleLabel,
    waitlistRolePlaceholder,
    waitlistDotLegend,
    waitlistYes,
    waitlistNo,
    consentHelper,
    consentUpdates,
    consentNotice,
    consentError,
    emailFieldError,
    companyFieldError,
    roleFieldError,
    dotFieldError,
    consentVersionNote,
  ].join("");
}

const bannedPrefixes = ["[PLACEHOLDER", "[CTO", "[DO NOT PUBLISH", "[NOTE", "[ATTORNEY", "[UPDATE", "[EFFECTIVE DATE", "[YEAR"] as const;

const bannedLiterals = ["CTO CONFIRM", "CTO RESULT", "DO NOT PUBLISH", "PLACEHOLDER", "ATTORNEY QUESTION"] as const;

/** Drop class and style attributes so design-token utilities are not read as copy. */
function legalCopySource(html: string): string {
  return html.replace(/\s(?:class|style)\s*=\s*(?:"[^"]*"|'[^']*')/g, "");
}

/** Tags and bracketed blanks that must never ship in legal HTML. */
export function findLegalCopyViolations(html: string): string[] {
  const copy = legalCopySource(html);
  const hits: string[] = [];
  for (const prefix of bannedPrefixes) {
    if (copy.includes(prefix)) hits.push(prefix);
  }
  for (const literal of bannedLiterals) {
    if (copy.includes(literal)) hits.push(literal);
  }
  for (const match of copy.match(/\[[^\]\n]+\]/g) ?? []) {
    hits.push(match);
  }
  return hits;
}
