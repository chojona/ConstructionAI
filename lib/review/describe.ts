import type { ProposedFactType } from "@/lib/domain/types";

export function describeFact(fact: { factType: ProposedFactType; payload: Record<string, string | null> }) {
  const payload = fact.payload;
  if (fact.factType === "equipment_requirement") return `${payload.equipment}: ${payload.statement}`;
  if (fact.factType === "schedule_date") return `${payload.event}: ${payload.date ?? payload.dateText}`;
  return `${payload.subject}: ${payload.amount} ${payload.unit}`;
}
