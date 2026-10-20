import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-chrome";
import { TermsOfUse } from "@/components/legal/terms-of-use";
import { readLegalFacts } from "@/lib/legal/facts";
import { canPublishLegalPages, enforceLegalPublishDuringBuild } from "@/lib/legal/publish";

enforceLegalPublishDuringBuild();

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pilot terms of use" };

export default function TermsPage() {
  enforceLegalPublishDuringBuild();
  if (!canPublishLegalPages()) notFound();
  return (
    <LegalDocumentPage>
      <TermsOfUse facts={readLegalFacts()} />
    </LegalDocumentPage>
  );
}
