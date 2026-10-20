import type { ReactNode } from "react";
import { draftBanner } from "@/lib/legal/copy";

export function LegalLogo() {
  return (
    // Host anchor: the publish scan cannot call next/link, which is a client component.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a className="legal-logo" href="/">
      <span className="brand-mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
          <path d="M14 6a6 6 0 0 1 6 6v3" />
          <path d="M4 15v-3a6 6 0 0 1 6-6" />
          <rect x="2" y="15" width="20" height="4" rx="1" />
        </svg>
      </span>
      ConstructionAI
    </a>
  );
}

export function DraftBanner({ text = draftBanner }: { text?: string | null }) {
  if (!text) return null;
  return <p className="legal-banner" role="note">{text}</p>;
}

export function LegalFooterLinks() {
  return (
    <nav className="legal-footer" aria-label="Legal" data-legal="footer">
      {/* Host anchors so the publish scan can read the link text. next/link is a client component. */}
      <a href="/privacy">Privacy and data deletion</a>
      <a href="/terms">Terms</a>
    </nav>
  );
}

export function LegalDocumentPage({ children, banner }: { children: ReactNode; banner: string | null }) {
  return (
    <div className="legal-page">
      <DraftBanner text={banner} />
      <header className="legal-top"><LegalLogo /></header>
      {children}
      <LegalFooterLinks />
    </div>
  );
}
