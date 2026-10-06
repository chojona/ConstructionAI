import { citeChipClassName } from "@/lib/review/citeLabel";

export function CiteChip({ label, title }: { label: string; title?: string }) {
  return <span className={citeChipClassName(label)} title={title}>{label}</span>;
}
