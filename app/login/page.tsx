import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { LegalFooterLinks } from "@/components/legal/legal-chrome";
import { legalLinksEnabled } from "@/lib/legal/publish";

export const metadata: Metadata = { title: "Sign in", referrer: "no-referrer" };

export default function LoginPage() {
  return (
    <>
      <main className="auth-card panel">
        <p className="eyebrow">Account</p>
        <h1>Sign in</h1>
        <p className="lede">Use the email and password for your own account.</p>
        <LoginForm />
      </main>
      {legalLinksEnabled() ? <LegalFooterLinks /> : null}
    </>
  );
}
