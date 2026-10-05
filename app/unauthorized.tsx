import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  return (
    <main className="page reading">
      <p className="eyebrow">Sign in</p>
      <h1>Sign in to open this desk.</h1>
      <p className="lede">Use the email and password for your own account.</p>
      <div className="status-actions"><Button asChild><Link href="/login">Sign in</Link></Button></div>
    </main>
  );
}
