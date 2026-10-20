import { redirect } from "next/navigation";
import { PilotLanding } from "@/components/legal/pilot-landing";
import { canPublishLegalPages, enforceLegalPublishDuringBuild } from "@/lib/legal/publish";

enforceLegalPublishDuringBuild();

export const dynamic = "force-dynamic";

export default function Home() {
  enforceLegalPublishDuringBuild();
  if (!canPublishLegalPages()) redirect("/projects");
  return <PilotLanding />;
}
