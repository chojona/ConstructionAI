import { redirect } from "next/navigation";
import { PilotLanding } from "@/components/legal/pilot-landing";
import { legalLinksEnabled, pilotLandingEnabled } from "@/lib/legal/publish";
import { enforceLegalCopyDuringBuild } from "@/lib/legal/scan";

enforceLegalCopyDuringBuild();

export const dynamic = "force-dynamic";

export default function Home() {
  enforceLegalCopyDuringBuild();
  if (!pilotLandingEnabled()) redirect("/projects");
  return <PilotLanding showLegalLinks={legalLinksEnabled()} />;
}
