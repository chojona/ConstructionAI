import type { Metadata } from "next";
import { AcceptForm } from "@/components/auth/accept-form";

export const metadata: Metadata = { title: "Accept invitation", referrer: "no-referrer" };

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="auth-card panel">
      <p className="eyebrow">Invitation</p>
      <h1>Accept invitation</h1>
      <p className="lede">Choose a password for your account. This link works once.</p>
      <AcceptForm token={token ?? ""} />
    </main>
  );
}
