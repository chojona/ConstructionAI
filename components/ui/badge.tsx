import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("status-label", className)} {...props} />;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const label = severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : severity;
  return <Badge className={`severity-${severity}`}>{label}</Badge>;
}
