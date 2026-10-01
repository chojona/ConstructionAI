import {
  CONSTRUCTION_FACTS_EXTRACTOR,
  conflictingAssertedLanguage,
  type ConstructionFactPage,
  type ConstructionFactsModelClient,
  type ProposedConstructionFact,
} from "./constructionFacts";

/**
 * In-repo extraction model. It reads page text only and never sees labeled facts.
 * There is no external language-model provider configured in this repository.
 */
export const DETERMINISTIC_CONSTRUCTION_FACTS_MODEL = {
  provider: "deterministic",
  model: "construction-facts-rules-v1",
} as const;

const months: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const monthPattern = Object.keys(months).join("|");
const unitPattern = "cubic yards|inches|inch|hours|feet|foot|C\\.Y\\.|CY|LF|sf|EA";
const quantityPattern = new RegExp(
  String.raw`(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+\.\d+|\d+)\s+(${unitPattern})(?!\w)`,
  "gi",
);
const equipmentNoun = /\b(rototiller|excavator|crane|pump)\b/i;

type Draft = { offset: number; fact: ProposedConstructionFact };

export function extractConstructionFacts(pages: readonly ConstructionFactPage[]) {
  const facts = pages.flatMap((page) => extractPage(page));
  return {
    extractorVersion: CONSTRUCTION_FACTS_EXTRACTOR.version,
    facts: facts.map((draft) => draft.fact),
  };
}

export const deterministicConstructionFactsModel: ConstructionFactsModelClient = {
  provider: DETERMINISTIC_CONSTRUCTION_FACTS_MODEL.provider,
  model: DETERMINISTIC_CONSTRUCTION_FACTS_MODEL.model,
  async extract(request) {
    return extractConstructionFacts(request.pages);
  },
};

function extractPage(page: ConstructionFactPage): Draft[] {
  const drafts: Draft[] = [];
  for (const sentence of sentences(page.text)) {
    drafts.push(...quantities(page, sentence));
    drafts.push(...dates(page, sentence));
    drafts.push(...equipment(page, sentence));
  }
  return dedupe(drafts).sort((left, right) => left.offset - right.offset || left.fact.type.localeCompare(right.fact.type));
}

function draft(offset: number, fact: ProposedConstructionFact): Draft {
  return { offset, fact };
}

function sentences(text: string) {
  const found: Array<{ text: string; start: number }> = [];
  const pattern = /[^\n]+/g;
  for (const line of text.matchAll(pattern)) {
    const source = line[0] ?? "";
    const lineStart = line.index ?? 0;
    const parts = source.split(/(?<=\.)\s+(?=[A-Z])/);
    let cursor = 0;
    for (const part of parts) {
      const start = source.indexOf(part, cursor);
      cursor = start + part.length;
      const trimmed = part.trim();
      if (!trimmed) continue;
      found.push({ text: trimmed, start: lineStart + start + part.indexOf(trimmed) });
    }
  }
  return found;
}

function quantities(
  page: ConstructionFactPage,
  sentence: { text: string; start: number },
): Draft[] {
  if (sentence.text.endsWith("?")) return [];
  const deleted = deletedSpan(sentence.text);
  const drafts: Draft[] = [];
  drafts.push(...phQuantities(page, sentence));
  for (const match of sentence.text.matchAll(quantityPattern)) {
    const amountText = match[1] ?? "";
    const rawUnit = match[2] ?? "";
    const localStart = match.index ?? 0;
    if (deleted && localStart >= deleted.start && localStart < deleted.end) continue;
    if (skippedNumber(sentence.text, localStart, localStart + amountText.length)) continue;
    const originalText = sentence.text.slice(localStart, localStart + match[0].length);
    const unit = rawUnit.toLowerCase() === "cubic yards" ? "yards" : rawUnit;
    const amount = amountText.replace(/,/g, "");
    const evidenceText = evidenceForQuantity(page.text, sentence.start + localStart, originalText);
    const evidence = locate(page, evidenceText, sentence.start + localStart - 90);
    if (!evidence) continue;
    const cited = conflictingAssertedLanguage(sentence.text) ? evidenceText : sentence.text;
    const citedEvidence = locate(page, cited, sentence.start) ?? evidence;
    const subject = quantitySubject(sentence.text, page.text, originalText, unit);
    drafts.push(draft(sentence.start + localStart, {
      type: "quantity",
      subject,
      amount,
      unit,
      originalText,
      modality: modalityFor(cited),
      evidence: [citedEvidence],
    }));
  }
  return drafts;
}

function phQuantities(
  page: ConstructionFactPage,
  sentence: { text: string; start: number },
): Draft[] {
  const match = /pH level between (\d+\.\d+) and (\d+\.\d+)/i.exec(sentence.text);
  if (!match) return [];
  const originalText = match[0];
  const evidence = locate(page, originalText, sentence.start);
  if (!evidence) return [];
  const subject = headingSubject(page.text, /topsoil/i) ?? "topsoil";
  return [match[1], match[2]].flatMap((amount, index) => {
    if (!amount) return [];
    return [draft(sentence.start + (match.index ?? 0) + index, {
      type: "quantity",
      subject,
      amount,
      unit: "pH",
      originalText,
      modality: "asserted",
      evidence: [evidence],
    })];
  });
}

function dates(
  page: ConstructionFactPage,
  sentence: { text: string; start: number },
): Draft[] {
  if (sentence.text.endsWith("?")) return [];
  const drafts: Draft[] = [];
  const month = new RegExp(
    String.raw`\b(${monthPattern})\s+(\d{1,2}),\s+(\d{4})\b`,
    "i",
  ).exec(sentence.text);
  if (month?.[1] && month[2] && month[3]) {
    const found = dateDraft(page, sentence, month[0], iso(month[3], months[month[1].toLowerCase()] ?? "", month[2]));
    if (found) drafts.push(found);
  }
  const blank = new RegExp(
    String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+_+\s*day of\s+_+\s*(${monthPattern})\s+(\d{4})`,
    "i",
  ).exec(sentence.text);
  if (blank?.[1] && blank[2] && blank[3]) {
    const found = dateDraft(page, sentence, blank[0], iso(blank[3], months[blank[2].toLowerCase()] ?? "", blank[1]));
    if (found) drafts.push(found);
  }
  const numeric = /\b(\d{2})-(\d{2})-(\d{4})\b/.exec(sentence.text);
  if (numeric?.[1] && numeric[2] && numeric[3]) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const ambiguous = first <= 12 && second <= 12;
    const found = dateDraft(
      page,
      sentence,
      numeric[0],
      ambiguous ? null : iso(numeric[3], numeric[1], numeric[2]),
    );
    if (found) drafts.push(found);
  }
  const isoDate = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(sentence.text);
  if (isoDate) {
    const found = dateDraft(page, sentence, sentence.text, isoDate[0]);
    if (found) drafts.push(found);
  }
  return drafts;
}

function dateDraft(
  page: ConstructionFactPage,
  sentence: { text: string; start: number },
  dateText: string,
  date: string | null,
): Draft | null {
  const evidenceText = sentence.text.includes(dateText) ? sentence.text : dateText;
  const evidence = locate(page, evidenceText, sentence.start) ?? locate(page, dateText, sentence.start);
  if (!evidence) return null;
  return draft(sentence.start + Math.max(0, sentence.text.indexOf(dateText)), {
    type: "schedule_date",
    event: eventName(sentence.text),
    date,
    dateText,
    modality: modalityFor(evidenceText),
    evidence: [evidence],
  });
}

function equipment(
  page: ConstructionFactPage,
  sentence: { text: string; start: number },
): Draft[] {
  if (sentence.text.endsWith("?") || sentence.text.length > 1000) return [];
  const names = equipmentNames(sentence.text);
  if (names.length === 0) return [];
  const evidence = locate(page, sentence.text, sentence.start);
  if (!evidence) return [];
  const modality = modalityFor(sentence.text);
  return names.map((name, index) => draft(sentence.start + index, {
    type: "equipment_requirement",
    equipment: name,
    statement: sentence.text,
    modality,
    evidence: [evidence],
  }));
}

function equipmentNames(sentence: string) {
  const additional = /\badditional\s+([A-Za-z][A-Za-z ]*?)\s+may be added\b/i.exec(sentence);
  if (additional?.[1]) return [displayName(additional[1])];

  const permission = /^(.*?)\s+(?:may be (?:used|disposed|added)|shall not be (?:used|disposed))\b/i.exec(sentence);
  if (permission?.[1]) {
    const name = permission[1].replace(/\s+more than\b[\s\S]*$/i, "").trim();
    return name ? [displayName(name)] : [];
  }

  const suchAs = /such as:\s*(.+)$/i.exec(sentence);
  if (suchAs?.[1]) {
    return suchAs[1]
      .replace(/\.$/, "")
      .split(/,\s*/)
      .map((item) => item.replace(/^(?:and|a|an)\s+/i, "").replace(/\s+for\s+.+$/i, "").trim())
      .filter((item) => item.length > 0)
      .map(displayName);
  }

  if (!/\b(shall|must|required|might)\b/i.test(sentence)) return [];
  const model = /\b([A-Z]{2,}\s+\d{2,})\s+(?:excavator|crane|pump)\b/.exec(sentence);
  if (model?.[1]) return [model[1]];
  const described = /\b([A-Za-z]+)\s+(crane|pump|excavator)\b/.exec(sentence);
  if (described?.[1] && described[2] && !/^(?:a|an|the)$/i.test(described[1])) {
    return [displayName(`${described[1]} ${described[2]}`)];
  }
  const bare = equipmentNoun.exec(sentence);
  return bare?.[1] ? [displayName(bare[1])] : [];
}

function quantitySubject(sentence: string, pageText: string, originalText: string, unit: string) {
  const quantityIs = /(?:^| )(?:the\s+)?([A-Za-z][A-Za-z/-]*)\s+quantity\s+is/i.exec(sentence);
  if (quantityIs?.[1]) return quantityIs[1].toLowerCase();

  if (/inch|inches/.test(unit) && /scarif/i.test(sentence) && /depth/i.test(sentence)) return "scarification depth";
  if (/inch|inches/.test(unit) && /till/i.test(sentence) && /depth/i.test(sentence)) return "tilling depth";
  if (/compost/i.test(sentence) && unit === "yards") return "compost";
  if (/compost/i.test(sentence) && unit === "sf") return "compost area";
  if (/temperature/i.test(sentence) && unit === "hours") return "atmospheric temperature window";
  if (/inch/i.test(unit) && /topsoil/i.test(pageText)) return "on-site topsoil";
  if (/inch/i.test(unit) && /solid material/i.test(sentence)) return "solid material";
  if (unit === "pH") return headingSubject(pageText, /topsoil/i) ?? "topsoil";
  if (unit === "C.Y." || unit === "CY") return lineTitle(sentence);
  if (unit === "EA") return lineTitle(sentence.replace(/^\d+\s+/, ""));
  if (unit === "foot" && /reconditioned surface/i.test(sentence)) return "reconditioned surface tolerance";
  if (unit === "foot" && /subgrade/i.test(sentence)) return "asphalt subgrade tolerance";
  if (unit === "foot" && /fill/i.test(sentence)) return "fill thickness";

  const ofSubject = new RegExp(String.raw`${escapeRegExp(originalText)}\s+of\s+([A-Za-z][A-Za-z ]+?)(?:\.|,|$)`, "i").exec(sentence);
  if (ofSubject?.[1] && !/^a\s/i.test(ofSubject[1])) return ofSubject[1].trim().toLowerCase();
  return "quantity";
}

function eventName(sentence: string) {
  if (/substantial completion/i.test(sentence)) return "substantial completion";
  if (/\b(?:begin|start)\b/i.test(sentence)) return "work start";
  if (/civil drawings/i.test(sentence) || /\bdrawings?\b/i.test(sentence)) return "civil drawings";
  if (/\baddendum\b/i.test(sentence)) return "addendum";
  if (/\brevision\b/i.test(sentence)) return "revision";
  const dated = /([A-Za-z][A-Za-z ]{2,40}?)\s+dated\b/i.exec(sentence);
  if (dated?.[1]) return dated[1].replace(/^(?:this|the)\s+/i, "").trim().toLowerCase();
  return "schedule";
}

function evidenceForQuantity(pageText: string, quantityStart: number, originalText: string) {
  const lookbackStart = Math.max(0, quantityStart - 90);
  const lookback = pageText.slice(lookbackStart, quantityStart);
  const hedge = /\b(may|might|could|if|unless|previously|previous|proposed)\b/i.exec(lookback);
  if (!hedge || hedge.index === undefined) return originalText;
  let start = lookbackStart + hedge.index;
  const wordBefore = /(\b[A-Za-z]+)\s*$/.exec(pageText.slice(Math.max(0, start - 30), start));
  if (wordBefore?.[0]) start -= wordBefore[0].length;
  return pageText.slice(start, quantityStart + originalText.length);
}

function dedupe(drafts: Draft[]) {
  const kept: Draft[] = [];
  for (const item of drafts) {
    const fact = item.fact;
    if (fact.evidence.length === 0) continue;
    if (fact.type === "quantity") {
      const duplicate = kept.find((candidate) => (
        candidate.fact.type === "quantity"
        && candidate.fact.amount === fact.amount
        && candidate.fact.unit === fact.unit
        && candidate.fact.originalText === fact.originalText
      ));
      if (duplicate) continue;
      const assertedTwin = fact.modality !== "asserted" && kept.some((candidate) => (
        candidate.fact.type === "quantity"
        && candidate.fact.modality === "asserted"
        && candidate.fact.amount === fact.amount
        && candidate.fact.unit === fact.unit
        && candidate.fact.originalText === fact.originalText
      ));
      if (assertedTwin) continue;
    }
    if (fact.type === "equipment_requirement") {
      const duplicate = kept.some((candidate) => (
        candidate.fact.type === "equipment_requirement"
        && candidate.fact.equipment.toLowerCase() === fact.equipment.toLowerCase()
      ));
      if (duplicate) continue;
    }
    kept.push(item);
  }
  return kept;
}

function modalityFor(text: string) {
  return conflictingAssertedLanguage(text) ?? "asserted";
}

function deletedSpan(sentence: string) {
  const match = /DELETE\s+([\s\S]+?)\s+AND REPLACE with\s+/i.exec(sentence);
  if (!match?.[1] || match.index === undefined) return null;
  const start = sentence.indexOf(match[1], match.index);
  return { start, end: start + match[1].length };
}

function skippedNumber(sentence: string, start: number, end: number) {
  const after = sentence.slice(end, end + 2);
  if (/^[%°’”"'*]/.test(after)) return true;
  const around = sentence.slice(Math.max(0, start - 16), Math.min(sentence.length, end + 16));
  return /\d\s*(?:to|–|—)\s*\d/i.test(around);
}

function lineTitle(sentence: string) {
  const title = /^([A-Za-z][A-Za-z ]+?)(?=\s+\d|\s*[|])/ .exec(sentence);
  return (title?.[1] ?? sentence.split(/\s+\d/)[0] ?? "quantity").trim().toLowerCase();
}

function headingSubject(pageText: string, pattern: RegExp) {
  const line = pageText.split("\n").find((item) => pattern.test(item)) ?? pageText;
  const cleaned = line.replace(/^\d+\.\s*/, "").replace(/^[A-Z]\.\s*/, "");
  const heading = cleaned.split(":")[0]?.trim().toLowerCase();
  return heading && pattern.test(heading) ? heading : null;
}

function locate(page: ConstructionFactPage, excerpt: string, from: number) {
  const startOffset = page.text.indexOf(excerpt, Math.max(0, from));
  if (startOffset < 0) {
    const fallback = page.text.indexOf(excerpt);
    if (fallback < 0) return null;
    return { pageNumber: page.pageNumber, excerpt, startOffset: fallback, endOffset: fallback + excerpt.length };
  }
  return { pageNumber: page.pageNumber, excerpt, startOffset, endOffset: startOffset + excerpt.length };
}

function displayName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return /\d/.test(trimmed) ? trimmed : trimmed.toLowerCase();
}

function iso(year: string, month: string, day: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
