# V0 quality gate

Recorded 2026-10-01. The extractor is the in-repo rules model `deterministic/construction-facts-rules-v1`. A design partner was not in this session. The walkthrough below is a manual pass of the same loop on a realistic revision pair.

`npm run quality:v0` reprints the measured rates from the stored reports and exits successfully only when those targets are met.

## Measured quality

| Check | Result |
| --- | --- |
| Extraction precision | 1.000 (goal 0.980) |
| Extraction recall | 1.000 (goal 0.950) |
| Extraction F1 | 1.000 |
| Evidence correctness | 1.000 across 34 value-matched facts (goal 0.990) |
| Unsupported high-confidence facts | 0 |
| Material-change precision | 1.000 (goal 0.980) |
| Material-change recall | 1.000 (goal 0.950) |
| False high-severity rate | 0.000 (0 of 7 high findings; 0 critical) |
| Processing latency | p50 2.795 ms, p95 5.454 ms, 31 of 31 runs, 0 failures, 0 timeouts |
| Extraction misses | 0 |
| Change misses | 0 |

Latency is the in-process benchmark in `benchmarks/latency/optimized.md`. It excludes provider network time. Storage is the slowest stage, at a p95 of 1.958 ms.

## Checks

| Check | Status |
| --- | --- |
| Typecheck | Passed |
| Lint | Passed |
| Unit | Passed |
| Integration | Passed |
| End-to-end | Passed (project, document, revision, evidence, accept, dismiss, flag) |
| Production build | Passed |
| Edge-case matrix | Covered by the unit tests named in `benchmarks/edge-cases/matrix.md` |

## Walkthrough

Uploaded Rev A (`Excavation quantity is 1250 CY`) and Rev B (`1500 CY`) for an earthworks specification.

The project opened on the change: previous 1250 CY, current 1500 CY, and the reason “Quantity for excavation changed from 1250 CY to 1500 CY, a 16.7% change.” The Rev B quote opened the source page at that sentence. Accepting the change recorded `excavation: 1500 CY` under current project values.

Rev A’s extracted quantity stayed in the open queue after that accept, labeled “Extracted from the source revision and not yet reviewed.” A reviewer can treat the change as the decision and still see the older fact as a second item.

## Known limits

- The benchmark is short public excerpts, not full drawing sets.
- Percentage amounts, fraction inches, and sieve ranges stay unlabeled. Recording them would invent a decimal or a unit the sentence does not use.
- `08-05-2025` stays an unparsed date token.
- A failed extraction stays on that run. The stored revision and earlier accepted facts remain.
- OCR, email, and HCSS are outside this gate.
