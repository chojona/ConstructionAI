import { z } from "zod";
import { DomainError, isDomainError } from "@/lib/domain/errors";
import type { ConstructionRepository } from "@/lib/domain/repository";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import { recordProposedFacts } from "./proposedFacts";
import { advanceExtractionRun, createExtractionRun, type Clock } from "./service";

export const CONSTRUCTION_FACTS_EXTRACTOR = {
  name: "construction-facts",
  version: "construction-facts-v1",
} as const;

const modalitySchema = z.enum(["asserted", "conditional", "tentative", "historical", "proposed"]);

const evidenceSchema = z.object({
  pageNumber: z.number().int().positive(),
  excerpt: z.string().trim().min(1).max(2000),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
}).strict();

const decimalAmount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const unitSchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9./-]{0,39}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, "Invalid calendar date.");

const equipmentFactSchema = z.object({
  type: z.literal("equipment_requirement"),
  equipment: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(1000),
  modality: modalitySchema,
  evidence: z.array(evidenceSchema).min(1).max(8),
}).strict();

const scheduleFactSchema = z.object({
  type: z.literal("schedule_date"),
  event: z.string().trim().min(1).max(200),
  date: isoDate.nullable(),
  dateText: z.string().trim().min(1).max(500),
  modality: modalitySchema,
  evidence: z.array(evidenceSchema).min(1).max(8),
}).strict();

const quantityFactSchema = z.object({
  type: z.literal("quantity"),
  subject: z.string().trim().min(1).max(200),
  amount: decimalAmount,
  unit: unitSchema,
  originalText: z.string().trim().min(1).max(200),
  modality: modalitySchema,
  evidence: z.array(evidenceSchema).min(1).max(8),
}).strict();

const factSchema = z.discriminatedUnion("type", [
  equipmentFactSchema,
  scheduleFactSchema,
  quantityFactSchema,
]);

const outputSchema = z.object({
  extractorVersion: z.literal(CONSTRUCTION_FACTS_EXTRACTOR.version),
  facts: z.array(factSchema).max(100),
}).strict();

export type ProposedConstructionFact = z.infer<typeof factSchema>;
export type ConstructionFactPage = { pageNumber: number; text: string };

export interface ConstructionFactsModelRequest {
  extractorName: typeof CONSTRUCTION_FACTS_EXTRACTOR.name;
  extractorVersion: typeof CONSTRUCTION_FACTS_EXTRACTOR.version;
  pages: ConstructionFactPage[];
}

export interface ConstructionFactsModelClient {
  provider: string;
  model: string;
  extract(request: ConstructionFactsModelRequest): Promise<unknown>;
}

const languageChecks: Array<{ label: "tentative" | "conditional" | "historical"; pattern: RegExp }> = [
  { label: "historical", pattern: /\b(previous(?:ly)?|formerly|had been|was previously|were previously)\b/i },
  { label: "conditional", pattern: /\b(if|unless|provided that|contingent(?: upon)?)\b/i },
  { label: "tentative", pattern: /\b(might|could|requested|proposed|tentative|approximately|around|subject to)\b/i },
  { label: "tentative", pattern: /\bmay\b(?!\s+\d{1,2}\b)/i },
];

export function parseConstructionFactsV1(
  raw: unknown,
  pages: readonly ConstructionFactPage[],
): ProposedConstructionFact[] {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError(
      "MALFORMED_OUTPUT",
      "Model output failed construction-facts-v1 validation.",
      422,
    );
  }

  for (const fact of parsed.data.facts) {
    assertEvidence(fact, pages);
    assertQuantity(fact);
    assertNotPromoted(fact);
  }
  return parsed.data.facts;
}

export async function runConstructionFactsExtraction(input: {
  organizationId: string;
  documentRevisionId: string;
  model: ConstructionFactsModelClient;
  repository?: ConstructionRepository;
  clock?: Clock;
}) {
  const repository = input.repository ?? constructionRepository;
  const clock = input.clock ?? (() => new Date());
  const run = await createExtractionRun(input.organizationId, input.documentRevisionId, {
    extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    provider: input.model.provider,
    model: input.model.model,
  }, repository);
  await advanceExtractionRun(input.organizationId, run.id, { status: "RUNNING" }, repository, clock);

  const revision = await repository.getRevision(input.organizationId, input.documentRevisionId);
  if (!revision) throw new DomainError("NOT_FOUND", "Revision not found.", 404);
  const pages = [...revision.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => ({ pageNumber: page.pageNumber, text: page.text }));

  try {
    const raw = await input.model.extract({
      extractorName: CONSTRUCTION_FACTS_EXTRACTOR.name,
      extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
      pages,
    });
    const proposedFacts = parseConstructionFactsV1(raw, pages);
    const succeeded = await recordProposedFacts(
      input.organizationId,
      run.id,
      proposedFacts,
      repository,
      clock,
    );
    return { run: succeeded, proposedFacts };
  } catch (error) {
    const malformed = isDomainError(error) && (error.code === "MALFORMED_OUTPUT" || error.code === "INVALID_INPUT");
    const failureCode = malformed ? "MALFORMED_OUTPUT" : "PROVIDER_ERROR";
    const failureMessage = malformed
      ? error.message
      : "The extraction model failed before it produced valid proposed facts.";
    await advanceExtractionRun(input.organizationId, run.id, {
      status: "FAILED",
      failureCode,
      failureMessage: failureMessage.slice(0, 500),
    }, repository, clock);
    if (malformed) throw error;
    throw new DomainError("PROVIDER_ERROR", failureMessage, 502);
  }
}

function assertEvidence(fact: ProposedConstructionFact, pages: readonly ConstructionFactPage[]) {
  for (const item of fact.evidence) {
    const page = pages.find((candidate) => candidate.pageNumber === item.pageNumber);
    const located = page?.text.slice(item.startOffset, item.endOffset);
    if (!page || located !== item.excerpt || item.endOffset <= item.startOffset) {
      throw new DomainError(
        "MALFORMED_OUTPUT",
        "Evidence does not match an exact location on the source page.",
        422,
      );
    }
  }
}

function assertQuantity(fact: ProposedConstructionFact) {
  if (fact.type !== "quantity") return;
  const unitToken = fact.unit.split("/").at(-1) ?? fact.unit;
  if (!fact.originalText.toLowerCase().includes(unitToken.toLowerCase()) || !amountAppears(fact.amount, fact.originalText)) {
    throw new DomainError(
      "MALFORMED_OUTPUT",
      "Quantity must retain its unit and exact decimal amount.",
      422,
    );
  }
}

function assertNotPromoted(fact: ProposedConstructionFact) {
  if (fact.modality !== "asserted") return;
  const language = factLanguage(fact);
  const matched = languageChecks.find((check) => check.pattern.test(language));
  if (!matched) return;
  throw new DomainError(
    "MALFORMED_OUTPUT",
    "Tentative, conditional, or historical language cannot be recorded as an asserted fact.",
    422,
  );
}

function factLanguage(fact: ProposedConstructionFact) {
  const excerpts = fact.evidence.map((item) => item.excerpt);
  if (fact.type === "equipment_requirement") return [fact.equipment, fact.statement, ...excerpts].join("\n");
  if (fact.type === "schedule_date") return [fact.event, fact.dateText, fact.date ?? "", ...excerpts].join("\n");
  return [fact.subject, fact.originalText, fact.amount, fact.unit, ...excerpts].join("\n");
}

function amountAppears(amount: string, originalText: string) {
  const source = originalText.replace(/,/g, "");
  let from = 0;
  while (from <= source.length) {
    const index = source.indexOf(amount, from);
    if (index < 0) return false;
    const before = index === 0 ? "" : source.charAt(index - 1);
    const after = source.charAt(index + amount.length);
    if (!/\d/.test(before) && !/\d/.test(after)) return true;
    from = index + 1;
  }
  return false;
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
