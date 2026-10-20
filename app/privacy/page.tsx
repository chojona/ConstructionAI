import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-chrome";
import { PrivacyNote } from "@/components/legal/privacy-note";
import { readLegalFacts } from "@/lib/legal/facts";
import { canPublishLegalPages, enforceLegalPublishDuringBuild } from "@/lib/legal/publish";

enforceLegalPublishDuringBuild();

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Privacy and data deletion" };

export default function PrivacyPage() {
  enforceLegalPublishDuringBuild();
  if (!canPublishLegalPages()) notFound();
  return (
    <LegalDocumentPage>
      <PrivacyNote facts={readLegalFacts()} />
    </LegalDocumentPage>
  );
}
