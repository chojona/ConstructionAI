import {
  CONSTRUCTION_FACTS_EXTRACTOR,
  type ConstructionFactPage,
  type ProposedConstructionFact,
} from "../constructionFacts";

export type FixtureEvidence = {
  pageNumber: number;
  excerpt: string;
  occurrence?: number;
};

type LabeledFact = ProposedConstructionFact extends infer Fact
  ? Fact extends ProposedConstructionFact
    ? Omit<Fact, "evidence"> & { evidence: FixtureEvidence[] }
    : never
  : never;

export type ConstructionFactsFixture = {
  id: string;
  description: string;
  pages: ConstructionFactPage[];
  expected: LabeledFact[];
};

export const CONSTRUCTION_FACTS_FIXTURES: readonly ConstructionFactsFixture[] = [
  {
    id: "equipment-requirement",
    description: "An explicit equipment requirement with exact page evidence.",
    pages: [{ pageNumber: 1, text: "A CAT 336 excavator shall be used for the trench." }],
    expected: [{
      type: "equipment_requirement",
      equipment: "CAT 336",
      statement: "A CAT 336 excavator shall be used for the trench.",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "A CAT 336 excavator shall be used for the trench." }],
    }],
  },
  {
    id: "schedule-date",
    description: "A calendar date tied to a schedule event.",
    pages: [{ pageNumber: 1, text: "Work shall begin on 2026-10-12." }],
    expected: [{
      type: "schedule_date",
      event: "work start",
      date: "2026-10-12",
      dateText: "Work shall begin on 2026-10-12.",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "Work shall begin on 2026-10-12." }],
    }],
  },
  {
    id: "quantity-unit",
    description: "A quantity that keeps its decimal amount and unit.",
    pages: [{ pageNumber: 1, text: "Excavation quantity is 1,250 CY." }],
    expected: [{
      type: "quantity",
      subject: "excavation",
      amount: "1250",
      unit: "CY",
      originalText: "1,250 CY",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "Excavation quantity is 1,250 CY." }],
    }],
  },
  {
    id: "conditional-tentative-language",
    description: "Hedged equipment language stays tentative or conditional.",
    pages: [{
      pageNumber: 1,
      text: [
        "A tower crane might be required for the steel erection.",
        "A dewatering pump shall be provided if groundwater is encountered.",
      ].join("\n"),
    }],
    expected: [
      {
        type: "equipment_requirement",
        equipment: "tower crane",
        statement: "A tower crane might be required for the steel erection.",
        modality: "tentative",
        evidence: [{ pageNumber: 1, excerpt: "A tower crane might be required for the steel erection." }],
      },
      {
        type: "equipment_requirement",
        equipment: "dewatering pump",
        statement: "A dewatering pump shall be provided if groundwater is encountered.",
        modality: "conditional",
        evidence: [{ pageNumber: 1, excerpt: "A dewatering pump shall be provided if groundwater is encountered." }],
      },
    ],
  },
  {
    id: "historical-vs-current",
    description: "A superseded date stays historical beside the current date.",
    pages: [{
      pageNumber: 1,
      text: [
        "The previous schedule showed substantial completion on 2026-08-01.",
        "Substantial completion shall be 2026-11-15.",
      ].join("\n"),
    }],
    expected: [
      {
        type: "schedule_date",
        event: "substantial completion",
        date: "2026-08-01",
        dateText: "The previous schedule showed substantial completion on 2026-08-01.",
        modality: "historical",
        evidence: [{ pageNumber: 1, excerpt: "The previous schedule showed substantial completion on 2026-08-01." }],
      },
      {
        type: "schedule_date",
        event: "substantial completion",
        date: "2026-11-15",
        dateText: "Substantial completion shall be 2026-11-15.",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "Substantial completion shall be 2026-11-15." }],
      },
    ],
  },
  {
    id: "contradictory-language",
    description: "Conflicting quantities are both retained instead of collapsed.",
    pages: [{
      pageNumber: 1,
      text: [
        "The excavation quantity is 1,250 CY.",
        "The excavation quantity is 980 CY.",
      ].join("\n"),
    }],
    expected: [
      {
        type: "quantity",
        subject: "excavation",
        amount: "1250",
        unit: "CY",
        originalText: "1,250 CY",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "The excavation quantity is 1,250 CY." }],
      },
      {
        type: "quantity",
        subject: "excavation",
        amount: "980",
        unit: "CY",
        originalText: "980 CY",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "The excavation quantity is 980 CY." }],
      },
    ],
  },
  {
    id: "repeated-evidence-text",
    description: "The same sentence twice still supports a single fact.",
    pages: [{
      pageNumber: 1,
      text: "Install 400 LF of silt fence.\nInstall 400 LF of silt fence.",
    }],
    expected: [{
      type: "quantity",
      subject: "silt fence",
      amount: "400",
      unit: "LF",
      originalText: "400 LF",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "Install 400 LF of silt fence.", occurrence: 0 }],
    }],
  },
  {
    id: "unsupported-facts",
    description: "Narrative and a question yield no construction fact.",
    pages: [{
      pageNumber: 1,
      text: [
        "The weather was clear on Monday and the crew ate lunch near the trailer.",
        "Does the site have room for a CAT 336 excavator?",
        "Questions about this section should be directed to the project engineer.",
      ].join("\n"),
    }],
    expected: [],
  },
];

export function goldPrediction(fixture: ConstructionFactsFixture): {
  extractorVersion: typeof CONSTRUCTION_FACTS_EXTRACTOR.version;
  facts: ProposedConstructionFact[];
} {
  return {
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    facts: fixture.expected.map((fact) => ({
      ...fact,
      evidence: fact.evidence.map((item) => locateExcerpt(fixture.pages, item)),
    })),
  };
}

export function locateExcerpt(
  pages: readonly ConstructionFactPage[],
  item: FixtureEvidence,
) {
  const page = pages.find((candidate) => candidate.pageNumber === item.pageNumber);
  if (!page) throw new Error(`Fixture page ${item.pageNumber} is missing.`);
  const occurrence = item.occurrence ?? 0;
  let from = 0;
  let startOffset = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    startOffset = page.text.indexOf(item.excerpt, from);
    if (startOffset < 0) {
      throw new Error(`Excerpt not found on page ${item.pageNumber}: ${item.excerpt}`);
    }
    from = startOffset + 1;
  }
  return {
    pageNumber: item.pageNumber,
    excerpt: item.excerpt,
    startOffset,
    endOffset: startOffset + item.excerpt.length,
  };
}
