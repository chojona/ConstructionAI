import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-chrome";
import { TermsOfUse } from "@/components/legal/terms-of-use";
import { readLegalFacts } from "@/lib/legal/facts";
import { canPublishLegalPages, legalDraftBanner } from "@/lib/legal/publish";
import { enforceLegalCopyDuringBuild } from "@/lib/legal/scan";

enforceLegalCopyDuringBuild();

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!canPublishLegalPages()) return {};
  return { title: "Pilot terms of use" };
}

export default function TermsPage() {
  enforceLegalCopyDuringBuild();
  if (!canPublishLegalPages()) notFound();
  return (
    <LegalDocumentPage banner={legalDraftBanner()}>
      <TermsOfUse facts={readLegalFacts()} />
    </LegalDocumentPage>
  );
}
