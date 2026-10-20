import { legalFactEnvKeys, legalFactKeys, type LegalFactKey, type LegalFacts } from "@/lib/legal/facts";

/** Values that pass fact validation. Not company facts, and not the rejected stand-ins. */
export const filledLegalFacts: LegalFacts = {
  legalEntityName: "Northline Contracting LLC",
  postalAddress: "100 Congress Avenue, Austin, TX 78701",
  privacyContactEmail: "privacy@northline.example",
  supportEmail: "support@northline.example",
  contactEmail: "contact@northline.example",
  effectiveDate: "October 20, 2026",
  storageProvider: "Amazon S3",
  storageProviderDetail: "Amazon S3, us-east-1",
  copyrightYear: "2026",
  attorneyDraftedClauses: "The pilot is provided as is. Liability is limited to fees paid, if any. Either party may end the pilot on 14 days' notice. Texas law governs.",
  bluebeamCsvColumns: "reviewer name, login, and comment text",
};

export function filledLegalFactEnv(facts: LegalFacts = filledLegalFacts): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of legalFactKeys) {
    const value = facts[key as LegalFactKey];
    if (value) env[legalFactEnvKeys[key as LegalFactKey]] = value;
  }
  return env;
}
