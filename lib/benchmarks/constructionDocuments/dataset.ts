import type { FixtureEvidence } from "@/lib/extractions/eval/fixtures";

export type BenchmarkPhenomenon =
  | "table"
  | "repeated-text"
  | "date-format"
  | "units"
  | "contradictory"
  | "conditional"
  | "addition"
  | "removal"
  | "wording-only";

export type BenchmarkChange = {
  changeType: "ADDED" | "REMOVED" | "MODIFIED";
  category: "equipment_requirement" | "schedule_date" | "quantity";
  material: boolean;
  basis: "identity" | "numeric" | "unit" | "date" | "modality" | "wording";
  slot: string;
};

type Modality = "asserted" | "conditional" | "tentative" | "historical" | "proposed";

type LabeledFact =
  | {
    type: "equipment_requirement";
    equipment: string;
    statement: string;
    modality: Modality;
    evidence: FixtureEvidence[];
  }
  | {
    type: "schedule_date";
    event: string;
    date: string | null;
    dateText: string;
    modality: Modality;
    evidence: FixtureEvidence[];
  }
  | {
    type: "quantity";
    subject: string;
    amount: string;
    unit: string;
    originalText: string;
    modality: Modality;
    evidence: FixtureEvidence[];
  };

export type BenchmarkNotFact = {
  pageNumber: number;
  excerpt: string;
  reason: string;
};

export type BenchmarkSide = {
  revisionLabel: string;
  pages: { pageNumber: number; text: string }[];
  expected: LabeledFact[];
  notFacts: BenchmarkNotFact[];
};

export type BenchmarkSource = {
  publisher: string;
  document: string;
  url: string;
  revisedUrl?: string;
  retrievedOn: "2026-09-30";
  rights: "public-agency-record";
  sanitization: string;
};

export type BenchmarkPair = {
  id: string;
  description: string;
  phenomena: BenchmarkPhenomenon[];
  labeling: "human";
  source: BenchmarkSource;
  base: BenchmarkSide;
  revised: BenchmarkSide;
  expectedChanges: BenchmarkChange[];
};

const thornton: BenchmarkSource = {
  publisher: "City of Thornton, Colorado",
  document: "Project specifications, solicitation attachment 18-182",
  url: "https://solicitations.thorntonco.gov/files/filerecords/view/vendorattachment/15409/18-182---project-specifications.pdf",
  retrievedOn: "2026-09-30",
  rights: "public-agency-record",
  sanitization: "Staff name, phone number, and street address from a neighboring subsection were omitted. Stored sentences are the published delete/replace text.",
};

const councilBluffs: BenchmarkSource = {
  publisher: "City of Council Bluffs, Iowa",
  document: "Supplemental Specifications to the 2026 SUDAS edition, January 2026",
  url: "https://www.councilbluffs-ia.gov/DocumentCenter/View/7115/Supplemental-Specifications-2026",
  retrievedOn: "2026-09-30",
  rights: "public-agency-record",
  sanitization: "PDF line breaks were joined with spaces. No personal names were present in the stored excerpts.",
};

const sudasAndCouncilBluffs: BenchmarkSource = {
  publisher: "Iowa SUDAS and City of Council Bluffs",
  document: "SUDAS 2023 Division 2 Section 2010, amended by Council Bluffs Supplemental Specifications January 2026",
  url: "https://www.iowasudas.org/wp-content/uploads/sites/15/2023/12/Division_02-2023.pdf",
  revisedUrl: "https://www.councilbluffs-ia.gov/DocumentCenter/View/7115/Supplemental-Specifications-2026",
  retrievedOn: "2026-09-30",
  rights: "public-agency-record",
  sanitization: "PDF line breaks in the replacement paragraph were joined with spaces. No personal names were present in the stored excerpts.",
};

const connecticut: BenchmarkSource = {
  publisher: "Connecticut Department of Administrative Services / bid portal",
  document: "Addenda 2 specifications, published original and revised quantity columns",
  url: "https://biznet.ct.gov/SCP_Documents/Bids/22100/88-178%20Addenda%202%20specifications.pdf",
  retrievedOn: "2026-09-30",
  rights: "public-agency-record",
  sanitization: "Item numbers, federal-aid project numbers, and names were omitted. Each page keeps the item description and both published occurrences of that column's quantity.",
};

const catawba: BenchmarkSource = {
  publisher: "Catawba County, North Carolina",
  document: "Addendum No. 4, waste processing facility project manual",
  url: "https://www.catawbacountync.gov/site/assets/files/2340/addendum_4_-_waste_processing.pdf",
  retrievedOn: "2026-09-30",
  rights: "public-agency-record",
  sanitization: "The engineer's name, signature line, and bid number were omitted. Stored dates and the check-dam lines are verbatim.",
};

const embankmentMay = "Removed concrete and asphalt material may be used to construct embankments in accordance with subsection 203.06";
const embankmentShall = "Removed concrete and asphalt material shall not be used to construct embankments.";
const solidMay = "Broken concrete, broken asphalt, or other solid material more than 6 inches in greatest dimension removed on the project may be disposed of in embankment side slope areas not supporting the roadway shoulders and pavement structures, as defined above.";
const solidShall = "Broken concrete, broken asphalt, or other solid material more than 6 inches in greatest dimension removed on the project shall not be disposed of on the project or incorporated into the work including in embankment side slope areas.";
const scarifyBase = "Soil embankments shall be constructed with moisture and density control, and the soil upon which the embankments are to be constructed shall be thoroughly scarified to a depth of 6 inches and compacted with moisture and density control. The moisture content of the soil at the time of compaction shall be as specified or directed.";
const scarifyRevised = "Soil embankments shall be constructed with moisture and density control, and the soil upon which the embankments are to be constructed shall be thoroughly scarified, plowed and well mixed to a depth of 12 inches (minimum) and compacted with moisture and density control. The moisture content of the soil at the time of compaction shall be as specified or directed.";
const moisture = "The moisture content of the soil at the time of compaction shall be as specified or directed.";
const structureBase = "Structure Excavation, structure backfill, and bed course material will not be measured but will be the quantities designated in the Contract.";
const structureRevised = "Structure excavation, structure backfill, and bed course material will not be measured separately but shall be incidental to the pipe and structure installation. Dewatering will be incidental for the installation of the structures.";
const compost = "Soil Amendment: A minimum 4 cubic yards (6 cubic yards for City maintained landscapes and all metropolitan district parks) per 1,000 sf of a class I or II compost shall be distributed across all soil surfaces and incorporated into the soil with a rototiller capable of tilling the to 8 inches in depth.";
const reconditioning = "A minimum 1 foot of moisture conditioned, compacted fill shall be placed beneath any geotextile base course. If a minimum 1 foot of fill is not proposed as a result of the proposed profile and street section, overexcavation shall be performed. The overexcavation shall carry through the cut areas and transition from cut to fill until a minimum of 1 foot of moisture conditioned, compacted material exists beneath the paving (unless Geotextile is utiized to reduce the required overexcavation as specified in the Construction Plans). Any overexcavation shall be included in the cost of reconditioning. The reconditioned surface shall not vary above or below the lines and grades as staked by more than 0.08 foot. The surface shall be tested for smoothness and density prior to the application of any geotextile and base course material. Where asphalt surfacing materials are to be placed directly on the subgrade, the subgrade plane shall not vary more than 0.04 foot. All irregularities exceeding the specified tolerance shall be corrected to the satisfaction of the Engineer at no additional cost. The surface shall be satisfactorily maintained until base course has been placed.";
const flyAshEquipment = "The equipment required shall include all equipment necessary to complete this item such as: grading and scarifying equipment, a spreader for the fly ash, mixing or pulverizing equipment, sheepsfoot and pneumatic or vibrating rollers, sprinkling equipment, and trucks.";
const flyAshTemperature = "The fly ash-treated subgrade shall not be mixed while the atmospheric temperature is below 40° F or when conditions indicate that temperatures may fall below 40° F within 24 hours, when it is foggy, rainy, or when soil or subgrade is frozen.";
const flyAshCondition = "If the moisture content exceeds the specified limits, additional fly ash may be added to lower the moisture content to the required limits.";
const flyAshTable = "Material Tolerance\nFly Ash +2%, -2%\nWater +2%, -3%";
const sudasTopsoil = "1. On-site Topsoil: a. Measurement: Measurement will be in cubic yards and will be computed on the basis of a uniform 8 inch finished thickness, or as specified.";
const councilTopsoil = "1. On-site Topsoil:\na. Measurement:\nDELETE 8 inch AND REPLACE with 4 inch.";
const sudasOffsite = "C. Off-site Topsoil: Contains at least 3% organic matter, according to ASTM D 2974, has a high degree of fertility, is free of herbicides that prohibit plant growth, has a pH level between 6.0 and 8.0, and meets the following mechanical analysis requirements:\n\nSieve Percent Passing 1” 100 1/2” 95* to 97* 1/4” 40 to 60 No. 100 40 to 60 No. 200 10 to 30 * 100% for turfgrass";
const councilOffsite = "C. Topsoil shall be considered as the fertile, uppermost part of the soil containing significant organic matter largely devoid of debris and rock and often disturbed in cultivation. The Engineer will approve the source of off-site topsoil. Surface soils supporting growth of noxious weeds or other undesirable vegetation will not be accepted.";
const phText = "pH level between 6.0 and 8.0";
const trenchBase = "TRENCH EXCAVATION 0’ – 10’ | 3,165 C.Y.\n3,165 C.Y.";
const trenchRevised = "TRENCH EXCAVATION 0’ – 10’ | 3,365 C.Y.\n3,365 C.Y.";
const drawingBase = "dated Revision June 6, 2025.";
const drawingRevised = "dated this ____7th __ day of __ August 2024\nBidding and Contract Documents dated May 2025.\n08-05-2025";
const augustBlank = "7th __ day of __ August 2024";
const checkDamBase = "Note that Item 41 – Check Dam has been added.";
const checkDamRevised = "41 Check Dam 5 EA";

function page(text: string) {
  return [{ pageNumber: 1, text }];
}

function cite(excerpt: string, occurrence?: number): FixtureEvidence[] {
  return [{ pageNumber: 1, excerpt, ...(occurrence === undefined ? {} : { occurrence }) }];
}

function equipment(equipmentName: string, statement: string, modality: Modality): LabeledFact {
  return { type: "equipment_requirement", equipment: equipmentName, statement, modality, evidence: cite(statement) };
}

function quantity(
  subject: string,
  amount: string,
  unit: string,
  originalText: string,
  modality: Modality,
  occurrence?: number,
): LabeledFact {
  return { type: "quantity", subject, amount, unit, originalText, modality, evidence: cite(originalText, occurrence) };
}

function schedule(event: string, date: string | null, dateText: string, modality: Modality): LabeledFact {
  return { type: "schedule_date", event, date, dateText, modality, evidence: cite(dateText) };
}

function side(revisionLabel: string, text: string, expected: LabeledFact[], notFacts: BenchmarkNotFact[] = []): BenchmarkSide {
  return { revisionLabel, pages: page(text), expected, notFacts };
}

const solidEquipment = "broken concrete, broken asphalt, or other solid material";

export const CONSTRUCTION_DOCUMENT_BENCHMARK = {
  id: "construction-documents-v1",
  labeling: "human" as const,
  description: "Human-labeled excerpts from public construction specifications and addenda. Model output is not ground truth.",
  knownLimitations: [
    "No design-partner or customer documents were available. Every pair is a public agency record retrieved on 2026-09-30.",
    "Several pairs are the deleted sentence and its published replacement, or the original and revised columns of one addendum, rather than two separately downloaded files.",
    "Pages are short verbatim excerpts. They are not full plan sets.",
    "Percentage amounts, fraction inches, and gradation ranges are left unlabeled because recording them would rewrite the source into a decimal or a unit the sentence does not use.",
    "08-05-2025 is stored with a null calendar date. Month-day and day-month readings were not chosen.",
    "May 2025 is unlabeled. construction-facts-v1 treats the month name May as tentative language, and the sentence is not hedged. See CON-30.",
    "The deleted 8 inch thickness remains visible in the Council Bluffs instruction and is not a remaining requirement.",
  ],
  pairs: [
    {
      id: "thornton-embankment-reuse",
      description: "A published permission to reuse removed pavement becomes a prohibition.",
      phenomena: [],
      labeling: "human",
      source: thornton,
      base: side("Section 202 delete", embankmentMay, [
        equipment("removed concrete and asphalt material", embankmentMay, "tentative"),
      ]),
      revised: side("Section 202 replace", embankmentShall, [
        equipment("removed concrete and asphalt material", embankmentShall, "asserted"),
      ]),
      expectedChanges: [
        { changeType: "MODIFIED", category: "equipment_requirement", material: true, basis: "modality", slot: "equipment_requirement:removed concrete and asphalt material" },
      ],
    },
    {
      id: "thornton-solid-material",
      description: "Disposal permission changes while the 6 inch dimension stays.",
      phenomena: ["units"],
      labeling: "human",
      source: thornton,
      base: side("Section 203.06 delete", solidMay, [
        quantity("solid material", "6", "inches", "6 inches", "asserted"),
        equipment(solidEquipment, solidMay, "tentative"),
      ]),
      revised: side("Section 203.06 replace", solidShall, [
        quantity("solid material", "6", "inches", "6 inches", "asserted"),
        equipment(solidEquipment, solidShall, "asserted"),
      ]),
      expectedChanges: [
        { changeType: "MODIFIED", category: "equipment_requirement", material: true, basis: "modality", slot: `equipment_requirement:${solidEquipment.replace(/,/g, "")}` },
      ],
    },
    {
      id: "thornton-scarification",
      description: "Scarification depth changes from 6 inches to 12 inches. The moisture sentence is unchanged and has no amount.",
      phenomena: ["units"],
      labeling: "human",
      source: thornton,
      base: side("Section 203.07 delete", scarifyBase, [
        quantity("scarification depth", "6", "inches", "6 inches", "asserted"),
      ], [{ pageNumber: 1, excerpt: moisture, reason: "No decimal amount is stated." }]),
      revised: side("Section 203.07 replace", scarifyRevised, [
        quantity("scarification depth", "12", "inches", "12 inches", "asserted"),
      ], [
        { pageNumber: 1, excerpt: moisture, reason: "No decimal amount is stated." },
        { pageNumber: 1, excerpt: "(minimum)", reason: "The parenthetical was not turned into a second quantity or a tentative modality." },
      ]),
      expectedChanges: [
        { changeType: "MODIFIED", category: "quantity", material: true, basis: "numeric", slot: "quantity:scarification depth" },
      ],
    },
    {
      id: "thornton-structure-measurement",
      description: "Measurement wording changes and no equipment, date, or decimal quantity is introduced.",
      phenomena: ["wording-only"],
      labeling: "human",
      source: thornton,
      base: side("Section 206.06 delete", structureBase, [], [
        { pageNumber: 1, excerpt: structureBase, reason: "The sentence mentions quantities without stating an amount." },
      ]),
      revised: side("Section 206.06 replace", structureRevised, [], [
        { pageNumber: 1, excerpt: "Dewatering will be incidental for the installation of the structures.", reason: "Incidental work is not an equipment requirement or a quantity." },
      ]),
      expectedChanges: [],
    },
    {
      id: "thornton-compost",
      description: "An added soil amendment states two compost minimums. Both amounts stay.",
      phenomena: ["contradictory", "addition", "units"],
      labeling: "human",
      source: thornton,
      base: side("Section 207.02 before the added paragraph", "Subsection 207.02 - Materials is revised to include the following:", []),
      revised: side("Section 207.02 soil amendment", compost, [
        quantity("compost", "4", "yards", "4 cubic yards", "asserted"),
        quantity("compost", "6", "yards", "6 cubic yards", "asserted"),
        quantity("compost area", "1000", "sf", "1,000 sf", "asserted"),
        quantity("tilling depth", "8", "inches", "8 inches", "asserted"),
        equipment("rototiller", compost, "asserted"),
      ]),
      expectedChanges: [
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:compost" },
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:compost" },
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:compost area" },
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:tilling depth" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:rototiller" },
      ],
    },
    {
      id: "thornton-reconditioning",
      description: "A replacement subgrade paragraph adds thicknesses, repeats 1 foot, and uses a conditional overexcavation sentence.",
      phenomena: ["conditional", "repeated-text", "units", "addition"],
      labeling: "human",
      source: thornton,
      base: side("Section 306.02 before replacement", "Subsection 306.02 - Construction Requirements shall be replaced with the following:", []),
      revised: side("Section 306.02 replacement", reconditioning, [
        quantity("fill thickness", "1", "foot", "1 foot", "asserted", 0),
        quantity("reconditioned surface tolerance", "0.08", "foot", "0.08 foot", "asserted"),
        quantity("asphalt subgrade tolerance", "0.04", "foot", "0.04 foot", "asserted"),
      ], [
        { pageNumber: 1, excerpt: "If a minimum 1 foot of fill is not proposed", reason: "The condition is not a separate fact beyond the labeled 1 foot thickness." },
      ]),
      expectedChanges: [
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:fill thickness" },
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:reconditioned surface tolerance" },
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:asphalt subgrade tolerance" },
      ],
    },
    {
      id: "council-bluffs-fly-ash",
      description: "Added fly-ash treatment includes a tolerance table, a repeated temperature, conditional fly ash, and required equipment.",
      phenomena: ["table", "repeated-text", "conditional", "addition", "units"],
      labeling: "human",
      source: councilBluffs,
      base: side("Section 2010 before fly ash replacement", "DELETE 3. Fly Ash and REPLACE with the following:", [], [
        { pageNumber: 1, excerpt: "3. Fly Ash", reason: "Article number, not a measured quantity." },
      ]),
      revised: side("Section 2010 fly ash replacement", [flyAshTable, flyAshTemperature, flyAshEquipment, flyAshCondition].join("\n"), [
        {
          type: "quantity",
          subject: "atmospheric temperature window",
          amount: "24",
          unit: "hours",
          originalText: "24 hours",
          modality: "tentative",
          evidence: cite("temperatures may fall below 40° F within 24 hours"),
        },
        equipment("grading and scarifying equipment", flyAshEquipment, "asserted"),
        equipment("spreader", flyAshEquipment, "asserted"),
        equipment("mixing or pulverizing equipment", flyAshEquipment, "asserted"),
        equipment("sheepsfoot and pneumatic or vibrating rollers", flyAshEquipment, "asserted"),
        equipment("sprinkling equipment", flyAshEquipment, "asserted"),
        equipment("trucks", flyAshEquipment, "asserted"),
        equipment("fly ash", flyAshCondition, "conditional"),
      ], [
        { pageNumber: 1, excerpt: "40° F", reason: "A temperature was not given a unit that drops the degree symbol." },
        { pageNumber: 1, excerpt: "+2%, -2%", reason: "Signed percentages were not rewritten as plain decimals." },
        { pageNumber: 1, excerpt: "+2%, -3%", reason: "Signed percentages were not rewritten as plain decimals." },
      ]),
      expectedChanges: [
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:grading and scarifying equipment" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:spreader" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:mixing or pulverizing equipment" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:sheepsfoot and pneumatic or vibrating rollers" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:sprinkling equipment" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:trucks" },
        { changeType: "ADDED", category: "equipment_requirement", material: true, basis: "identity", slot: "equipment_requirement:fly ash" },
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:atmospheric temperature window" },
      ],
    },
    {
      id: "sudas-topsoil-thickness",
      description: "Council Bluffs replaces the SUDAS 8 inch finished topsoil thickness with 4 inch.",
      phenomena: ["units"],
      labeling: "human",
      source: sudasAndCouncilBluffs,
      base: side("SUDAS 2023 Section 2010", sudasTopsoil, [
        quantity("on-site topsoil", "8", "inch", "8 inch", "asserted"),
      ], [
        { pageNumber: 1, excerpt: "cubic yards", reason: "A unit of measure without an amount." },
        { pageNumber: 1, excerpt: "or as specified", reason: "No alternate thickness is stated." },
      ]),
      revised: side("Council Bluffs January 2026", councilTopsoil, [
        quantity("on-site topsoil", "4", "inch", "4 inch", "asserted"),
      ], [
        { pageNumber: 1, excerpt: "8 inch", reason: "Quoted as the deleted thickness, not the remaining requirement." },
      ]),
      expectedChanges: [
        { changeType: "MODIFIED", category: "quantity", material: true, basis: "numeric", slot: "quantity:on site topsoil" },
      ],
    },
    {
      id: "sudas-offsite-topsoil",
      description: "A gradation table and pH bounds are replaced by a definition with no numeric limits.",
      phenomena: ["table", "removal"],
      labeling: "human",
      source: sudasAndCouncilBluffs,
      base: side("SUDAS 2023 Section 2010 2.01.C", sudasOffsite, [
        quantity("off-site topsoil", "6.0", "pH", phText, "asserted"),
        quantity("off-site topsoil", "8.0", "pH", phText, "asserted"),
      ], [
        { pageNumber: 1, excerpt: "3%", reason: "A percent sign was not rewritten into a unit word." },
        { pageNumber: 1, excerpt: "1” 100", reason: "The gradation row was not split into a percent quantity." },
        { pageNumber: 1, excerpt: "95* to 97*", reason: "A starred range was not collapsed to one number." },
        { pageNumber: 1, excerpt: "40 to 60", reason: "A passing range was not collapsed to one number." },
        { pageNumber: 1, excerpt: "10 to 30", reason: "A passing range was not collapsed to one number." },
      ]),
      revised: side("Council Bluffs January 2026 2.01.C", councilOffsite, [], [
        { pageNumber: 1, excerpt: councilOffsite, reason: "Definitional soil language with no equipment, date, or decimal quantity." },
      ]),
      expectedChanges: [
        { changeType: "REMOVED", category: "quantity", material: true, basis: "identity", slot: "quantity:off site topsoil" },
        { changeType: "REMOVED", category: "quantity", material: true, basis: "identity", slot: "quantity:off site topsoil" },
      ],
    },
    {
      id: "ct-trench-excavation",
      description: "A public addendum revises trench excavation and prints each quantity twice.",
      phenomena: ["repeated-text", "units"],
      labeling: "human",
      source: connecticut,
      base: side("Addendum original column", trenchBase, [
        quantity("trench excavation", "3165", "C.Y.", "3,165 C.Y.", "asserted", 0),
      ], [
        { pageNumber: 1, excerpt: "0’ – 10’", reason: "A depth range was not split into two quantities." },
      ]),
      revised: side("Addendum revised column", trenchRevised, [
        quantity("trench excavation", "3365", "C.Y.", "3,365 C.Y.", "asserted", 0),
      ], [
        { pageNumber: 1, excerpt: "0’ – 10’", reason: "A depth range was not split into two quantities." },
      ]),
      expectedChanges: [
        { changeType: "MODIFIED", category: "quantity", material: true, basis: "numeric", slot: "quantity:trench excavation" },
      ],
    },
    {
      id: "catawba-drawing-dates",
      description: "Drawing and addendum dates use a month name, a filled blank, and an unparsed numeric token.",
      phenomena: ["date-format"],
      labeling: "human",
      source: catawba,
      base: side("Drawings quoted for deletion", drawingBase, [
        schedule("civil drawings", "2025-06-06", "June 6, 2025", "asserted"),
      ]),
      revised: side("Addendum No. 4 dates", drawingRevised, [
        schedule("addendum", "2024-08-07", augustBlank, "asserted"),
        schedule("civil drawings", null, "08-05-2025", "asserted"),
      ], [
        { pageNumber: 1, excerpt: "May 2025", reason: "The month name May cannot be stored as an asserted date under construction-facts-v1. The sentence is not hedged, so it was not labeled tentative. See CON-30." },
      ]),
      expectedChanges: [
        { changeType: "MODIFIED", category: "schedule_date", material: true, basis: "date", slot: "schedule_date:civil drawings" },
        { changeType: "ADDED", category: "schedule_date", material: true, basis: "identity", slot: "schedule_date:addendum" },
      ],
    },
    {
      id: "catawba-check-dam",
      description: "The addendum adds a check dam quantity that the prior note does not state.",
      phenomena: ["addition"],
      labeling: "human",
      source: catawba,
      base: side("Addendum note", checkDamBase, [], [
        { pageNumber: 1, excerpt: "41", reason: "Bid item number, not a measured quantity." },
      ]),
      revised: side("Addendum 4 bid form", checkDamRevised, [
        quantity("check dam", "5", "EA", "5 EA", "asserted"),
      ], [
        { pageNumber: 1, excerpt: "41", reason: "Bid item number, not a measured quantity." },
      ]),
      expectedChanges: [
        { changeType: "ADDED", category: "quantity", material: true, basis: "identity", slot: "quantity:check dam" },
      ],
    },
  ] satisfies BenchmarkPair[],
};

export type ConstructionDocumentBenchmark = typeof CONSTRUCTION_DOCUMENT_BENCHMARK;
