# CON-21 PDF parsing optimization

Measured on 2026-10-01 with Node.js v22.23.2 on darwin/arm64. Both runs used the same command and workload:

```bash
npm run bench:latency -- --iterations 31 --pages 8
```

Each successful run ingested and analyzed two eight-page PDF revisions (5,132 combined PDF bytes and 394 combined extracted-text bytes). One warmup run was excluded. Both measurements completed 31 of 31 runs with no failures or timeouts.

## Before and after

| Measurement | Before p50 ms | After p50 ms | Change | Before p95 ms | After p95 ms | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PDF parsing | 1.018 | 0.005 | -99.5% | 2.078 | 0.010 | -99.5% |
| End to end | 3.324 | 0.721 | -78.3% | 6.303 | 1.699 | -73.0% |

Before optimization, PDF parsing was the slowest successful stage at p95. After optimization, storage is the slowest stage at p95 (0.554 ms). All 62 measured parses after warmup were validated content-cache hits; unique PDFs still use the unchanged parsing path.

## Optimization and safeguards

- Parsed pages are keyed by the SHA-256 identity of the exact PDF bytes and an explicit parser-result version.
- Concurrent requests for the same identity share one in-flight parse.
- Ready results are bounded to 32 entries and 16 MiB of extracted text, with least-recently-used eviction.
- Callers receive defensive page copies, so one request cannot mutate a later result.
- Failed parses are never cached; retries perform fresh work.
- Revision persistence remains authoritative. Concurrent duplicate uploads still produce exactly one immutable revision, and the losing upload cleans up its stored object.

The extraction/evidence, construction-document accuracy, deterministic revision comparison, and concurrency/retry regression suites must remain green alongside this benchmark.
