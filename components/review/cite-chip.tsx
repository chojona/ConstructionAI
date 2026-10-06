import type { CitePinStatus } from "@/lib/review/citeLabel";

export function CiteChip({
  label,
  status,
  title,
}: {
  label: string;
  status: CitePinStatus;
  title?: string;
}) {
  return <span className="page-chip" data-pin-status={status} title={title}>{label}</span>;
}
