import Link from "next/link";
import { Button } from "@/components/ui/button";
import { currentSessionViewer } from "@/lib/auth/sessionViewer";

export default async function NotFound() {
  const viewer = await currentSessionViewer();
  const href = viewer ? "/projects" : "/login";
  const label = viewer ? "Return to projects" : "Sign in";
  return (
    <main className="page reading">
      <p className="eyebrow">Not found</p>
      <h1>This record is not available.</h1>
      <p className="lede">It may not exist or may belong to another organization.</p>
      <div className="status-actions"><Button asChild><Link href={href}>{label}</Link></Button></div>
    </main>
  );
}
