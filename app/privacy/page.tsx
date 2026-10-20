import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-chrome";
import { PrivacyNote } from "@/components/legal/privacy-note";
import { readLegalFacts } from "@/lib/legal/facts";
import { canPublishLegalPages, legalDraftBanner } from "@/lib/legal/publish";
import { enforceLegalCopyDuringBuild } from "@/lib/legal/scan";

enforceLegalCopyDuringBuild();

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!canPublishLegalPages()) return {};
  return { title: "Privacy and data deletion" };
}

export default function PrivacyPage() {
  enforceLegalCopyDuringBuild();
  if (!canPublishLegalPages()) notFound();
  return (
    <LegalDocumentPage banner={legalDraftBanner()}>
      <PrivacyNote facts={readLegalFacts()} />
    </LegalDocumentPage>
  );
}
