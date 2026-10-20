/**
 * Facts Legal still has to fill in before /privacy and /terms can ship.
 * Every value is unset unless the matching environment variable is non-empty.
 * Unset or rejected facts render as bracketed blanks. They are never invented here.
 */

export const legalFactKeys = [
  "legalEntityName",
  "postalAddress",
  "privacyContactEmail",
  "supportEmail",
  "contactEmail",
  "effectiveDate",
  "storageProvider",
  "storageProviderDetail",
  "copyrightYear",
  "attorneyDraftedClauses",
  "bluebeamCsvColumns",
] as const;

export type LegalFactKey = (typeof legalFactKeys)[number];

export type LegalFacts = Record<LegalFactKey, string | null>;

/** Visible blank used when a fact is still unset. The publish guard rejects these. */
export const legalFactMarkers: Record<LegalFactKey, string> = {
  legalEntityName: "[legal entity name]",
  postalAddress: "[postal address]",
  privacyContactEmail: "[privacy contact email]",
  supportEmail: "[support email]",
  contactEmail: "[contact email]",
  effectiveDate: "[effective date]",
  storageProvider: "[storage provider]",
  storageProviderDetail: "[storage provider name and region, once confirmed]",
  copyrightYear: "[year]",
  attorneyDraftedClauses: "[warranty disclaimer, liability limit, fees, term and termination, and governing law]",
  bluebeamCsvColumns: "[bluebeam csv columns]",
};

export const legalFactEnvKeys: Record<LegalFactKey, string> = {
  legalEntityName: "LEGAL_ENTITY_NAME",
  postalAddress: "LEGAL_POSTAL_ADDRESS",
  privacyContactEmail: "LEGAL_PRIVACY_EMAIL",
  supportEmail: "LEGAL_SUPPORT_EMAIL",
  contactEmail: "LEGAL_CONTACT_EMAIL",
  effectiveDate: "LEGAL_EFFECTIVE_DATE",
  storageProvider: "LEGAL_STORAGE_PROVIDER",
  storageProviderDetail: "LEGAL_STORAGE_PROVIDER_DETAIL",
  copyrightYear: "LEGAL_COPYRIGHT_YEAR",
  attorneyDraftedClauses: "LEGAL_ATTORNEY_DRAFTED_CLAUSES",
  bluebeamCsvColumns: "LEGAL_BLUEBEAM_CSV_COLUMNS",
};

const emailFactKeys = new Set<LegalFactKey>(["privacyContactEmail", "supportEmail", "contactEmail"]);

/** Not drawn anywhere. Empty is allowed. A value that is present still has to be valid. */
const optionalLegalFactKeys = new Set<LegalFactKey>(["contactEmail", "copyrightYear"]);

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function roundTrips(year: number, monthIndex: number, day: number): boolean {
  const parsed = new Date(year, monthIndex, day);
  return parsed.getFullYear() === year && parsed.getMonth() === monthIndex && parsed.getDate() === day;
}

function validEffectiveDate(trimmed: string): boolean {
  const named = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(trimmed);
  if (named) {
    const monthIndex = monthNames.indexOf(named[1]);
    if (monthIndex < 0) return false;
    return roundTrips(Number(named[3]), monthIndex, Number(named[2]));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!iso) return false;
  return roundTrips(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
}

function unset(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function readLegalFacts(env: NodeJS.ProcessEnv = process.env): LegalFacts {
  return {
    legalEntityName: unset(env.LEGAL_ENTITY_NAME),
    postalAddress: unset(env.LEGAL_POSTAL_ADDRESS),
    privacyContactEmail: unset(env.LEGAL_PRIVACY_EMAIL),
    supportEmail: unset(env.LEGAL_SUPPORT_EMAIL),
    contactEmail: unset(env.LEGAL_CONTACT_EMAIL),
    effectiveDate: unset(env.LEGAL_EFFECTIVE_DATE),
    storageProvider: unset(env.LEGAL_STORAGE_PROVIDER),
    storageProviderDetail: unset(env.LEGAL_STORAGE_PROVIDER_DETAIL),
    copyrightYear: unset(env.LEGAL_COPYRIGHT_YEAR),
    attorneyDraftedClauses: unset(env.LEGAL_ATTORNEY_DRAFTED_CLAUSES),
    bluebeamCsvColumns: unset(env.LEGAL_BLUEBEAM_CSV_COLUMNS),
  };
}

/** Reject stand-ins and values that are not a real email, date, or year. */
export function legalFactRejected(key: LegalFactKey, value: string | null): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return !optionalLegalFactKeys.has(key);
  if (/\bTBD\b/i.test(trimmed) || /fixture\.example/i.test(trimmed) || trimmed.includes("Fixture")) return true;
  if (emailFactKeys.has(key) && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed)) return true;
  if (key === "effectiveDate" && !validEffectiveDate(trimmed)) return true;
  if (key === "copyrightYear" && !/^\d{4}$/.test(trimmed)) return true;
  return false;
}

export function missingLegalFactKeys(facts: LegalFacts = readLegalFacts()): LegalFactKey[] {
  return legalFactKeys.filter((key) => legalFactRejected(key, facts[key]));
}

export const emptyLegalFacts: LegalFacts = {
  legalEntityName: null,
  postalAddress: null,
  privacyContactEmail: null,
  supportEmail: null,
  contactEmail: null,
  effectiveDate: null,
  storageProvider: null,
  storageProviderDetail: null,
  copyrightYear: null,
  attorneyDraftedClauses: null,
  bluebeamCsvColumns: null,
};
