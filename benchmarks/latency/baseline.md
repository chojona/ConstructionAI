# Document intelligence latency baseline

Generated: 2026-10-01T03:30:37.797Z
Successful-run samples used for percentiles: 11 of 11 runs (11 requested).
Failures: 0. Timeouts: 0.

Percentiles use successful stage samples only. A timeout or failure stays out of the p50/p95 distribution, including when it returns faster than a slow success.

## Workload
- 8 pages per PDF, two revisions per run.
- Combined PDF bytes per run: 5132.
- Combined extracted text bytes per run: 394.

## Stage latency

| Stage | Successes | Failures | Timeouts | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| upload_validation | 22 | 0 | 0 | 0.067 | 0.168 |
| storage | 22 | 0 | 0 | 0.850 | 1.776 |
| pdf_parsing | 22 | 0 | 0 | 2.708 | 5.084 |
| ai_extraction | 22 | 0 | 0 | 0.016 | 0.049 |
| structured_output_validation | 22 | 0 | 0 | 0.076 | 0.301 |
| proposed_fact_persistence | 22 | 0 | 0 | 0.030 | 0.060 |
| revision_comparison | 22 | 0 | 0 | 0.044 | 0.109 |
| review_attention | 11 | 0 | 0 | 0.012 | 0.081 |
| end_to_end | 11 | 0 | 0 | 8.657 | 14.111 |

## Bottleneck

The slowest successful stage by p95 is `pdf_parsing` at 5.084 ms. Optimization should start there.

## Notes
- Runtime v22.23.2 on darwin/arm64.
- One warmup pass is excluded so percentiles describe steady-state processing. Warmup PDF parsing took 160.123 ms.
- The model client is an in-process baseline stub that returns valid facts immediately. ai_extraction therefore excludes provider network time.
- Timing context stores byte size, page count, and text length only. Source text, filenames, storage keys, and excerpts are omitted.
- Use this baseline before optimizing extraction or comparison.
