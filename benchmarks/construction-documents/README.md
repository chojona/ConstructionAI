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

## Known limitations

- These are short excerpts, not full drawing sets. No design-partner documents were available.
- Percentage amounts, fraction inches, and sieve ranges are listed as not-facts. Recording them would change the source text into a decimal or a unit the sentence does not use.
- `08-05-2025` stays an unparsed date token.
- `May 2025` is unlabeled. The current extractor treats the month name May as tentative language. The sentence is not hedged, so it was not labeled tentative. That gap is tracked separately.
- The deleted 8 inch topsoil thickness is still visible in the replacement instruction and is not labeled as the remaining requirement.
