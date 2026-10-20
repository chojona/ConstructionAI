import type { ReactNode } from "react";
import Link from "next/link";
import { HardHat } from "lucide-react";
import { draftBanner } from "@/lib/legal/copy";

export function LegalLogo() {
  return (
    <Link className="legal-logo" href="/">
      <span className="brand-mark"><HardHat size={18} aria-hidden /></span>
      ConstructionAI
    </Link>
  );
}

export function DraftBanner() {
  return <p className="legal-banner" role="note">{draftBanner}</p>;
}

export function LegalFooterLinks() {
  return (
    <nav className="legal-footer" aria-label="Legal" data-legal="footer">
      <Link href="/privacy">Privacy and data deletion</Link>
      <Link href="/terms">Terms</Link>
    </nav>
  );
}

export function LegalDocumentPage({ children }: { children: ReactNode }) {
  return (
    <div className="legal-page">
      <DraftBanner />
      <header className="legal-top"><LegalLogo /></header>
      {children}
      <LegalFooterLinks />
    </div>
  );
}
