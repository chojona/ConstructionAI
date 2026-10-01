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
  {
    id: "month-name-date",
    description: "A month-name schedule date keeps the calendar day written on the page.",
    pages: [{ pageNumber: 1, text: "Civil drawings dated June 6, 2025." }],
    expected: [{
      type: "schedule_date",
      event: "civil drawings",
      date: "2025-06-06",
      dateText: "June 6, 2025",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "June 6, 2025" }],
    }],
  },
  {
    id: "ambiguous-numeric-date",
    description: "A numeric date that can be read month-day or day-month stays unparsed.",
    pages: [{ pageNumber: 1, text: "Civil drawings dated 08-05-2025." }],
    expected: [{
      type: "schedule_date",
      event: "civil drawings",
      date: null,
      dateText: "08-05-2025",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "08-05-2025" }],
    }],
  },
  {
    id: "delete-replace-thickness",
    description: "A delete-and-replace instruction keeps the replacement thickness only.",
    pages: [{ pageNumber: 1, text: "1. On-site Topsoil:\nDELETE 8 inch AND REPLACE with 4 inch." }],
    expected: [{
      type: "quantity",
      subject: "on-site topsoil",
      amount: "4",
      unit: "inch",
      originalText: "4 inch",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "4 inch" }],
    }],
  },
  {
    id: "ph-bounds",
    description: "A pH range stays two source amounts instead of one collapsed decimal.",
    pages: [{ pageNumber: 1, text: "C. Off-site Topsoil: has a pH level between 6.0 and 8.0." }],
    expected: [
      {
        type: "quantity",
        subject: "off-site topsoil",
        amount: "6.0",
        unit: "pH",
        originalText: "pH level between 6.0 and 8.0",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "pH level between 6.0 and 8.0" }],
      },
      {
        type: "quantity",
        subject: "off-site topsoil",
        amount: "8.0",
        unit: "pH",
        originalText: "pH level between 6.0 and 8.0",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "pH level between 6.0 and 8.0" }],
      },
    ],
  },
  {
    id: "equipment-list",
    description: "An equipment list keeps each named item and drops the purpose clause.",
    pages: [{
      pageNumber: 1,
      text: "The equipment required shall include all equipment necessary to complete this item such as: grading and scarifying equipment, a spreader for the fly ash, mixing or pulverizing equipment, sheepsfoot and pneumatic or vibrating rollers, sprinkling equipment, and trucks.",
    }],
    expected: [
      "grading and scarifying equipment",
      "spreader",
      "mixing or pulverizing equipment",
      "sheepsfoot and pneumatic or vibrating rollers",
      "sprinkling equipment",
      "trucks",
    ].map((equipment) => ({
      type: "equipment_requirement" as const,
      equipment,
      statement: "The equipment required shall include all equipment necessary to complete this item such as: grading and scarifying equipment, a spreader for the fly ash, mixing or pulverizing equipment, sheepsfoot and pneumatic or vibrating rollers, sprinkling equipment, and trucks.",
      modality: "asserted" as const,
      evidence: [{
        pageNumber: 1,
        excerpt: "The equipment required shall include all equipment necessary to complete this item such as: grading and scarifying equipment, a spreader for the fly ash, mixing or pulverizing equipment, sheepsfoot and pneumatic or vibrating rollers, sprinkling equipment, and trucks.",
      }],
    })),
  },
  {
    id: "hedged-permission-keeps-dimension",
    description: "A measured dimension stays asserted when the hedge applies to the permission.",
    pages: [{
      pageNumber: 1,
      text: "Broken concrete or other solid material more than 6 inches in greatest dimension may be disposed of on site.",
    }],
    expected: [
      {
        type: "quantity",
        subject: "solid material",
        amount: "6",
        unit: "inches",
        originalText: "6 inches",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "6 inches" }],
      },
      {
        type: "equipment_requirement",
        equipment: "broken concrete or other solid material",
        statement: "Broken concrete or other solid material more than 6 inches in greatest dimension may be disposed of on site.",
        modality: "tentative",
        evidence: [{
          pageNumber: 1,
          excerpt: "Broken concrete or other solid material more than 6 inches in greatest dimension may be disposed of on site.",
        }],
      },
    ],
  },
  {
    id: "volume-and-tilling-depth",
    description: "Compost volume and tilling depth stay separate quantities in one sentence.",
    pages: [{ pageNumber: 1, text: "A minimum 4 cubic yards of compost shall be tilled to a depth of 8 inches." }],
    expected: [
      {
        type: "quantity",
        subject: "compost",
        amount: "4",
        unit: "yards",
        originalText: "4 cubic yards",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "4 cubic yards" }],
      },
      {
        type: "quantity",
        subject: "tilling depth",
        amount: "8",
        unit: "inches",
        originalText: "8 inches",
        modality: "asserted",
        evidence: [{ pageNumber: 1, excerpt: "8 inches" }],
      },
    ],
  },
  {
    id: "fill-thickness",
    description: "Fill thickness is not renamed from the words between the amount and the noun.",
    pages: [{
      pageNumber: 1,
      text: "A minimum 1 foot of moisture conditioned, compacted fill shall be placed beneath the geotextile.",
    }],
    expected: [{
      type: "quantity",
      subject: "fill thickness",
      amount: "1",
      unit: "foot",
      originalText: "1 foot",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "1 foot" }],
    }],
  },
  {
    id: "tentative-temperature-window",
    description: "A temperature window governed by may stays tentative and keeps hours.",
    pages: [{ pageNumber: 1, text: "Do not mix when temperatures may fall below 40° F within 24 hours." }],
    expected: [{
      type: "quantity",
      subject: "atmospheric temperature window",
      amount: "24",
      unit: "hours",
      originalText: "24 hours",
      modality: "tentative",
      evidence: [{ pageNumber: 1, excerpt: "temperatures may fall below 40° F within 24 hours" }],
    }],
  },
  {
    id: "repeated-cubic-yards",
    description: "A quantity printed twice is one fact, and the depth range is not split.",
    pages: [{ pageNumber: 1, text: "TRENCH EXCAVATION 0’ – 10’ | 3,165 C.Y.\n3,165 C.Y." }],
    expected: [{
      type: "quantity",
      subject: "trench excavation",
      amount: "3165",
      unit: "C.Y.",
      originalText: "3,165 C.Y.",
      modality: "asserted",
      evidence: [{ pageNumber: 1, excerpt: "3,165 C.Y.", occurrence: 0 }],
    }],
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
