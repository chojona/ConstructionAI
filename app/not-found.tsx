import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="page reading">
      <p className="eyebrow">Not found</p>
      <h1>This record is not available.</h1>
      <p className="lede">It may not exist or may belong to another organization.</p>
      <div className="status-actions"><Button asChild><Link href="/projects">Return to projects</Link></Button></div>
    </main>
  );
}
