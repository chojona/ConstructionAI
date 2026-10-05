import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in", referrer: "no-referrer" };

export default function LoginPage() {
  return (
    <main className="auth-card panel">
      <p className="eyebrow">Account</p>
      <h1>Sign in</h1>
      <p className="lede">Use the email and password for your own account.</p>
      <LoginForm />
    </main>
  );
}
