"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page"><p className="eyebrow">Workspace unavailable</p><h1>We couldn’t load this workspace.</h1><p className="lede" role="alert">Try again to reconnect to the project and its source documents.</p><div className="finding-actions"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/projects">Return to projects</Link></Button></div></main>;
}
