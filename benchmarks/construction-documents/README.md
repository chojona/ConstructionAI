# Construction document benchmark

This dataset checks whether extraction and revision comparison hold up on public construction text. The labels were written by reading the stored excerpts. They are not model output.

Run it again with:

```bash
npm run eval:construction-documents
```

A predictions file is a JSON object keyed by `pairId:base` and `pairId:revised`. Without that file, the command scores the human labels and exits non-zero unless those labels are internally consistent and the labeled changes match deterministic comparison.

## What is included

Twelve revision pairs, each with page text, expected equipment requirements, schedule dates, quantities, evidence excerpts, and expected added, removed, or modified facts. The set includes a gradation table, repeated quantities and temperatures, more than one date format, more than one unit, two amounts for the same compost item, conditional language, additions, removals, and a wording change that states no new fact.

## Sources and sanitization

Every pair is a public agency record retrieved on 2026-09-30. Publishers and URLs are on each pair in `lib/benchmarks/constructionDocuments/dataset.ts`. Stored pages omit personal names, phone numbers, street addresses, and bid numbers. PDF line breaks in a few paragraphs were joined with spaces. The words are otherwise the published words.

Some pairs are a sentence an addendum says to delete and the sentence that replaces it, or the original and revised columns of one addendum. They are not two independently downloaded files.

## Extraction accuracy

`npm run eval:extraction-accuracy` runs the in-repo extractor on these pages and writes `reports/extraction-accuracy.json`. The extractor sees page text only. It does not read the human labels, and the score is not labels compared with themselves.

The report records strict precision, recall, and F1, plus evidence correctness, the unsupported high-confidence count, modality correctness, and unit/value normalization. It breaks those rates down by fact type and by difficult-language tags. Every strict miss has a failure class. A goal is marked achieved only when that run meets the goal.

## Revision change accuracy

`npm run eval:change-accuracy` compares the human-labeled facts on each pair and writes `reports/change-accuracy.json`. It does not call a model. The score covers added, removed, and modified changes, material precision and recall, wording-only suppression, date and unit equivalence, reordered facts, repeated facts, and old/new evidence. A miss records a failure class. A goal is marked achieved only when that run meets it.

Equivalent units (`C.Y.` and cubic yards, inches and inch) and equivalent calendar dates (`June 6, 2025` and `6 June 2025`) stay non-material, so they do not enter the project attention queue. Ambiguous numeric dates such as `08-05-2025` are not treated as a calendar date. The comparison does not infer equipment or schedule conflicts beyond the labeled facts.

## Severity

Severity is a deterministic rule, not a model score. Each scored change has one disposition:

- **Change detected.** Wording-only and normalization-equivalent edits. Severity is low, and they stay out of the attention queue.
- **Material change.** The equipment, schedule, or quantity value differs. The reason names the old and new values.
- **Proven conflict.** Only when an external equipment assignment or schedule commitment is supplied and contradicts the document. Revision text alone never scores critical and never says "conflict".

Thresholds, applied only when both sides are comparable:

- A quantity change is high at a relative change of 10% or more, using the larger absolute amount as the baseline. Smaller numeric changes stay medium. A unit change is high because the amounts are not on one scale.
- A schedule change is high when both dates are calendar dates and the shift is 7 days or more. Shorter measured shifts stay medium. If either date is not a calendar date, the change is high because the shift cannot be measured.
- Replacing one required equipment name with another is high. Removing required equipment is high. Adding a requirement is medium. A required-to-prohibited reversal is high.

The change-accuracy report's false high rate counts high and critical predictions that do not match a labeled change scored the same way. This benchmark supplies no assignment or commitment records, so critical stays at zero.

## Known limitations

- These are short excerpts, not full drawing sets. No design-partner documents were available.
- Percentage amounts, fraction inches, and sieve ranges are listed as not-facts. Recording them would change the source text into a decimal or a unit the sentence does not use.
- `08-05-2025` stays an unparsed date token.
- Schedule events are words written on the page. The June line is `revision`. The August blank and `08-05-2025` name no event, so those facts use the event `schedule`.
- `May 2025` is unlabeled. It is a month and year with no day, and the in-repo extractor does not emit that shape as a schedule fact. The sentence is not hedged.
- The deleted 8 inch topsoil thickness is still visible in the replacement instruction and is not labeled as the remaining requirement.
