"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page"><p className="eyebrow">Workspace unavailable</p><h1>This workspace didn’t load.</h1><p className="lede" role="alert">The project and its source documents could not be fetched. Try again, or return to the project list.</p><div className="status-actions finding-actions"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/projects">Return to projects</Link></Button></div></main>;
}
