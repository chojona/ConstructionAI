import { legalFactMarkers, type LegalFactKey, type LegalFacts } from "@/lib/legal/facts";

export function FactText({ id, facts }: { id: LegalFactKey; facts: LegalFacts }) {
  const value = facts[id]?.trim() ?? "";
  if (!value) return <span className="legal-blank">{legalFactMarkers[id]}</span>;
  return <>{value}</>;
}

export function FactEmail({ id, facts }: { id: LegalFactKey; facts: LegalFacts }) {
  const value = facts[id]?.trim() ?? "";
  if (!value) return <span className="legal-blank">{legalFactMarkers[id]}</span>;
  return <a href={`mailto:${value}`}>{value}</a>;
}
