import type { ComparableFact, RevisionFactChange } from "@/lib/revisions/compareFacts";

/**
 * Deterministic materiality and severity policy.
 *
 * Three dispositions stay separate:
 * - change_detected: a difference was found and it is not material (wording or normalization).
 * - material_change: equipment, schedule, or quantity values differ under the rules below.
 * - proven_conflict: an external assignment or commitment record contradicts a material fact.
 *
 * Revision text alone never scores critical and never uses the word "conflict".
 * The same normalized fact values always produce the same severity.
 */
export const QUANTITY_HIGH_RELATIVE_CHANGE = 0.1;
export const SCHEDULE_HIGH_DAY_SHIFT = 7;

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export type SeverityDisposition = "change_detected" | "material_change" | "proven_conflict";

export type ConflictEvidence = {
  kind: "equipment_assignment" | "schedule_commitment";
  summary: string;
};

export type SeverityAssessment = {
  severity: SeverityLevel;
  disposition: SeverityDisposition;
  rule: string;
  reason: string;
};

type ScoredChange = Pick<RevisionFactChange, "changeType" | "category" | "material" | "basis" | "before" | "after">;

export function scoreRevisionChange(change: ScoredChange, conflict?: ConflictEvidence | null): SeverityAssessment {
  const proven = provenConflict(change, conflict);
  if (proven) return proven;
  if (!change.material) {
    return assessment(
      "low",
      "change_detected",
      "wording.only",
      "Only the wording changed. This is not a material change.",
    );
  }
  if (change.category === "equipment_requirement") return scoreEquipment(change);
  if (change.category === "schedule_date") return scoreSchedule(change);
  return scoreQuantity(change);
}

function provenConflict(change: ScoredChange, conflict?: ConflictEvidence | null): SeverityAssessment | null {
  const summary = conflict?.summary.trim() ?? "";
  if (!change.material || !conflict || summary === "") return null;
  if (conflict.kind === "equipment_assignment" && change.category === "equipment_requirement") {
    const equipment = text(change.after, "equipment") || text(change.before, "equipment") || "the required equipment";
    return assessment(
      "critical",
      "proven_conflict",
      "conflict.equipment_assignment",
      `Equipment conflict: the document requires ${equipment}, and the assignment record says ${sentence(summary)}`,
    );
  }
  if (conflict.kind === "schedule_commitment" && change.category === "schedule_date") {
    const when = dateLabel(change.after) || dateLabel(change.before) || "the stated date";
    const event = text(change.after, "event") || text(change.before, "event") || "the event";
    return assessment(
      "critical",
      "proven_conflict",
      "conflict.schedule_commitment",
      `Schedule conflict: the document states ${event} on ${when}, and the commitment record says ${sentence(summary)}`,
    );
  }
  return null;
}

function scoreEquipment(change: ScoredChange): SeverityAssessment {
  const before = text(change.before, "equipment");
  const after = text(change.after, "equipment");
  if (before && after && normalize(before) !== normalize(after)) {
    return assessment(
      "high",
      "material_change",
      "equipment.substitution",
      `Required equipment changed from ${before} to ${after}. Review availability before scheduled work.`,
    );
  }
  if (change.basis === "modality") return modalityAssessment(change, "equipment requirement");
  if (change.changeType === "REMOVED") {
    return assessment(
      "high",
      "material_change",
      "equipment.removed",
      `Required equipment removed: ${before || "the previous requirement"}.`,
    );
  }
  if (change.changeType === "ADDED") {
    return assessment(
      "medium",
      "material_change",
      "equipment.added",
      `Required equipment added: ${after || "the new requirement"}.`,
    );
  }
  return assessment(
    "high",
    "material_change",
    "equipment.changed",
    `Required equipment changed${before ? `: ${before}` : ""}.`,
  );
}

function scoreSchedule(change: ScoredChange): SeverityAssessment {
  const event = text(change.after, "event") || text(change.before, "event") || "the event";
  if (change.basis === "modality") return modalityAssessment(change, `schedule date for ${event}`);
  if (change.changeType === "ADDED") {
    return assessment(
      "medium",
      "material_change",
      "schedule.added",
      `Schedule date added for ${event}: ${dateLabel(change.after) || "unspecified"}.`,
    );
  }
  if (change.changeType === "REMOVED") {
    return assessment(
      "high",
      "material_change",
      "schedule.removed",
      `Schedule date removed for ${event}: ${dateLabel(change.before) || "unspecified"}.`,
    );
  }
  const beforeIso = isoDate(change.before);
  const afterIso = isoDate(change.after);
  const beforeLabel = dateLabel(change.before) || "unspecified";
  const afterLabel = dateLabel(change.after) || "unspecified";
  if (!beforeIso || !afterIso) {
    return assessment(
      "high",
      "material_change",
      "schedule.unparsed",
      `Schedule date for ${event} changed from ${beforeLabel} to ${afterLabel}. The dates are not both calendar dates, so the size of the shift is not measured.`,
    );
  }
  const days = dayShift(beforeIso, afterIso);
  const shift = `Schedule date for ${event} changed from ${beforeLabel} to ${afterLabel}, a shift of ${days} ${days === 1 ? "day" : "days"}.`;
  if (days >= SCHEDULE_HIGH_DAY_SHIFT) {
    return assessment("high", "material_change", "schedule.day_shift", shift);
  }
  return assessment("medium", "material_change", "schedule.short_shift", shift);
}

function scoreQuantity(change: ScoredChange): SeverityAssessment {
  const subject = text(change.after, "subject") || text(change.before, "subject") || "the item";
  if (change.basis === "modality") return modalityAssessment(change, `quantity for ${subject}`);
  if (change.basis === "unit") {
    const beforeUnit = text(change.before, "unit") || "the previous unit";
    const afterUnit = text(change.after, "unit") || "the new unit";
    return assessment(
      "high",
      "material_change",
      "quantity.unit",
      `Quantity unit for ${subject} changed from ${beforeUnit} to ${afterUnit}. The amounts are not compared on one scale.`,
    );
  }
  if (change.changeType === "ADDED") {
    return assessment(
      "medium",
      "material_change",
      "quantity.added",
      `Quantity added for ${subject}: ${amountLabel(change.after)}.`,
    );
  }
  if (change.changeType === "REMOVED") {
    return assessment(
      "high",
      "material_change",
      "quantity.removed",
      `Quantity removed for ${subject}: ${amountLabel(change.before)}.`,
    );
  }
  const beforeAmount = decimal(text(change.before, "amount"));
  const afterAmount = decimal(text(change.after, "amount"));
  if (beforeAmount === null || afterAmount === null) {
    return assessment(
      "high",
      "material_change",
      "quantity.unparsed",
      `Quantity for ${subject} changed from ${amountLabel(change.before)} to ${amountLabel(change.after)}. The amounts are not both numbers, so the size of the change is not measured.`,
    );
  }
  const relative = relativeChange(beforeAmount, afterAmount);
  const percent = `${(relative * 100).toFixed(1)}%`;
  const described = `Quantity for ${subject} changed from ${amountLabel(change.before)} to ${amountLabel(change.after)}, a ${percent} change.`;
  if (relative >= QUANTITY_HIGH_RELATIVE_CHANGE) {
    return assessment("high", "material_change", "quantity.relative_change", described);
  }
  return assessment("medium", "material_change", "quantity.small_change", described);
}

function modalityAssessment(change: ScoredChange, noun: string): SeverityAssessment {
  const before = polarity(obligation(change.before));
  const after = polarity(obligation(change.after));
  const shift = before && after && before !== after
    ? `The ${noun} changed from ${before} to ${after}.`
    : `The certainty of the ${noun} changed.`;
  return assessment("high", "material_change", "modality.changed", shift);
}

function sentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function assessment(
  severity: SeverityLevel,
  disposition: SeverityDisposition,
  rule: string,
  reason: string,
): SeverityAssessment {
  return { severity, disposition, rule, reason };
}

function obligation(fact: ComparableFact | null) {
  if (!fact) return "";
  if (fact.factType === "equipment_requirement") return text(fact, "statement");
  if (fact.factType === "schedule_date") return text(fact, "dateText");
  return text(fact, "originalText");
}

function polarity(value: string): "required" | "prohibited" | null {
  if (/\b(shall not|must not|may not|do not|does not|is not permitted|shall never)\b/i.test(value)) return "prohibited";
  if (/\b(shall|must|required)\b/i.test(value)) return "required";
  return null;
}

function amountLabel(fact: ComparableFact | null) {
  const amount = text(fact, "amount");
  const unit = text(fact, "unit");
  if (amount && unit) return `${amount} ${unit}`;
  return amount || unit || "unspecified";
}

function dateLabel(fact: ComparableFact | null) {
  return text(fact, "dateText") || isoDate(fact) || "";
}

function isoDate(fact: ComparableFact | null) {
  const date = fact?.payload.date ?? null;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function dayShift(before: string, after: string) {
  const left = Date.parse(`${before}T00:00:00Z`);
  const right = Date.parse(`${after}T00:00:00Z`);
  return Math.abs(Math.round((right - left) / 86_400_000));
}

function decimal(value: string) {
  const cleaned = value.replace(/,/g, "");
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function relativeChange(before: number, after: number) {
  const span = Math.max(Math.abs(before), Math.abs(after));
  if (span === 0) return before === after ? 0 : 1;
  return Math.abs(after - before) / span;
}

function text(fact: ComparableFact | null, key: string) {
  const value = fact?.payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
