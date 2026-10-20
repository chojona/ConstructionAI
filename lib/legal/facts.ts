/**
 * Facts Legal still has to fill in before /privacy and /terms can ship.
 * Every value is unset unless the matching environment variable is non-empty.
 * Unset facts render as bracketed blanks such as [legal entity name] so a leak
 * cannot hide in the markup. They are never invented here.
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
  "warrantyDisclaimer",
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
  warrantyDisclaimer: "[warranty disclaimer]",
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
  warrantyDisclaimer: "LEGAL_WARRANTY_DISCLAIMER",
};

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
    warrantyDisclaimer: unset(env.LEGAL_WARRANTY_DISCLAIMER),
  };
}

export function missingLegalFactKeys(facts: LegalFacts = readLegalFacts()): LegalFactKey[] {
  return legalFactKeys.filter((key) => !facts[key]?.trim());
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
  warrantyDisclaimer: null,
};

/** Obvious stand-in values for tests and flag-on screenshots. Not company facts. */
export const filledLegalFacts: LegalFacts = {
  legalEntityName: "Fixture Construction LLC",
  postalAddress: "1 Fixture Street, Austin, TX 78701",
  privacyContactEmail: "privacy@fixture.example",
  supportEmail: "support@fixture.example",
  contactEmail: "contact@fixture.example",
  effectiveDate: "October 20, 2026",
  storageProvider: "Fixture Object Storage",
  storageProviderDetail: "Fixture Object Storage, us-east-1",
  copyrightYear: "2026",
  warrantyDisclaimer: "Fixture text only. An attorney has not drafted this disclaimer.",
};

export function filledLegalFactEnv(facts: LegalFacts = filledLegalFacts): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of legalFactKeys) {
    const value = facts[key];
    if (value) env[legalFactEnvKeys[key]] = value;
  }
  return env;
}
