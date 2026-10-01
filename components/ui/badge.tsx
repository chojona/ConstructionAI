import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex rounded px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em]", className)}
      {...props}
    />
  );
}
