# Document intelligence latency optimization

Generated: 2026-10-01T18:25:03.303Z
Successful-run samples used for percentiles: 31 of 31 runs (31 requested).
Failures: 0. Timeouts: 0.

Percentiles use successful stage samples only. A timeout or failure stays out of the p50/p95 distribution, including when it returns faster than a slow success.

## Workload
- 8 pages per PDF, two revisions per run.
- Combined PDF bytes per run: 5132.
- Combined extracted text bytes per run: 394.

## Stage latency

| Stage | Successes | Failures | Timeouts | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| upload_validation | 62 | 0 | 0 | 0.036 | 0.101 |
| storage | 62 | 0 | 0 | 0.843 | 1.958 |
| pdf_parsing | 62 | 0 | 0 | 0.014 | 0.028 |
| ai_extraction | 62 | 0 | 0 | 0.009 | 0.019 |
| structured_output_validation | 62 | 0 | 0 | 0.054 | 0.187 |
| proposed_fact_persistence | 62 | 0 | 0 | 0.032 | 0.118 |
| revision_comparison | 62 | 0 | 0 | 0.046 | 0.117 |
| review_attention | 31 | 0 | 0 | 0.006 | 0.019 |
| end_to_end | 31 | 0 | 0 | 2.795 | 5.454 |

## Bottleneck

The slowest successful stage by p95 is `storage` at 1.958 ms. Optimization should start there.

## Notes
- Runtime v22.23.2 on darwin/arm64.
- One warmup pass is excluded so percentiles describe steady-state processing. Warmup PDF parsing took 161.017 ms.
- The model client is an in-process baseline stub that returns valid facts immediately. ai_extraction therefore excludes provider network time.
- Measured PDF parses used 62 cache hits, 0 misses, and 0 coalesced in-flight results after warmup.
- The repeated-content workload measures validated reuse; a unique PDF remains a cache miss and follows the unchanged parser path.
- Timing context stores byte size, page count, and text length only. Source text, filenames, storage keys, and excerpts are omitted.
