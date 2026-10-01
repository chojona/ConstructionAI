# Document intelligence edge-case matrix

Each row is an explicit state. Failures are not filled in with invented facts. A later attempt is a new extraction run; earlier runs, page text, and evidence stay as they were.

| Case | Expected state | Regression |
| --- | --- | --- |
| 1-page PDF | One processed page, page number 1 | `lib/documents/ingestRevision.test.ts` |
| Multi-page PDF under the 500-page cap | Every page kept in order | `lib/documents/ingestRevision.test.ts` |
| More than 500 pages | `FILE_TOO_LARGE`. No revision stored | `lib/documents/ingestRevision.test.ts` |
| Page count does not match extracted pages | `MALFORMED_PDF`. No revision stored | `lib/documents/ingestRevision.test.ts` |
| Repeated sentence on one page | One fact. Evidence offset is the first exact span | `lib/extractions/deterministicExtractor.test.ts` |
| Table rows that share a quantity | One quantity fact per subject | `lib/extractions/deterministicExtractor.test.ts` |
| Reordered facts | No change solely because order changed | `lib/revisions/compareFacts.test.ts` |
| Duplicate PDF upload | `DUPLICATE_REVISION`. The first revision stays | `lib/documents/ingestRevision.test.ts` |
| Missing revision label | `INVALID_INPUT`. Nothing stored | `lib/documents/ingestRevision.test.ts` |
| Odd revision label | Stored trimmed, including punctuation | `lib/documents/ingestRevision.test.ts` |
| Same equipment, different requirements | Each statement and modality kept | `lib/extractions/deterministicExtractor.test.ts`, `lib/review/projectState.test.ts` |
| `1,250 CY` vs `1250 cubic yards` | Non-material when the amount matches | `lib/revisions/compareFacts.test.ts` |
| Small and large quantity changes | Material numeric changes | `lib/revisions/compareFacts.test.ts` |
| Equivalent dates written differently | Non-material when the calendar day matches | `lib/revisions/compareFacts.test.ts` |
| `may` / `if` vs `shall` | Conditional or tentative, not asserted | `lib/extractions/constructionFacts.test.ts`, `lib/extractions/deterministicExtractor.test.ts` |
| `shall` vs `shall not` | Material modality change | `lib/revisions/compareFacts.test.ts` |
| Historical language | Not stored as an asserted fact | `lib/extractions/constructionFacts.test.ts` |
| Removed requirement | Stays effective until the removal is accepted | `lib/review/projectState.test.ts` |
| Rev B uploaded before Rev A | Order follows upload, not the label | `lib/documents/ingestRevision.test.ts`, `lib/review/projectState.test.ts` |
| Malformed model output | Run `FAILED` / `MALFORMED_OUTPUT`. No proposed facts | `lib/extractions/constructionFacts.test.ts` |
| Provider error | Run `FAILED` / `PROVIDER_ERROR` | `lib/extractions/constructionFacts.test.ts` |
| Model timeout | Run `FAILED` / `TIMEOUT` | `lib/extractions/constructionFacts.test.ts` |
| Partial fact write | Unreviewed rows from that attempt are discarded. Run `FAILED` | `lib/extractions/constructionFacts.test.ts` |
| Retry after failure | New attempt. Prior run, evidence, and accepted state stay | `lib/extractions/constructionFacts.test.ts` |
