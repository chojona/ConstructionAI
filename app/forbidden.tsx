import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="page reading">
      <p className="eyebrow">Access denied</p>
      <h1>You do not have access to this organization.</h1>
      <p className="lede">Active membership is required.</p>
      <div className="status-actions"><Button asChild><Link href="/login">Sign in</Link></Button></div>
    </main>
  );
}
