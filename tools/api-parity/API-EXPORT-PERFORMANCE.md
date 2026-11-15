# API export performance review

Updated 2026-11-15 using existing GitHub Actions logs and retained audit timings. This review makes no additional SWC requests or spreadsheet changes.

## Current optimization: twenty workers and compact publication state

The final read-only comparison [43762988776](https://github.com/toddaggie95/swc-personal-analytics/actions/runs/43762988776) reached twenty simultaneous detail jobs and passed all 21 batches. It collected all 1,013 details with exactly 1,013 worker requests, no retries/failures, and 550 requests remaining on each full worker. The workbook preview again matched all 1,087 orders with zero validation errors and writes disabled.

| Stage | Four workers, live baseline | Twelve workers, read-only | Twenty workers, read-only |
|---|---:|---:|---:|
| Planning job | 103s | 58s | 64s |
| Detail job window | 387s | 140s | 92s |
| Assembly job | 12s | 10s | 10s |
| Complete API input window | 510s | 215s | 174s (2m54s) |
| Full primary job window | 544s, including writes | 245s, no writes | 203s (3m23s), no writes |

Twenty is the selected production cap: another 41 seconds (19%) faster for API inputs than twelve, with no observed retry/quota penalty. It is a cap; GitHub runner availability may reduce actual concurrency. Actual write-enabled end-to-end timing will be measured on the next production run. Roughly four to five minutes overall is an estimate, not a measured live total.

### Twelve-worker comparison

Read-only benchmark [43760123250](https://github.com/toddaggie95/swc-personal-analytics/actions/runs/43760123250) passed all 21 batches, exact coverage, and the full workbook preview. It read all 1,013 tracked details with exactly 1,013 worker requests, zero retries/failures, and 550 requests remaining on every full 50-read worker. All 1,087 orders and publication builders validated. Production sheet writes, acceptance and Drive cleanup were disabled.

| Same stage measurement | First live four-worker run | Twelve-worker benchmark |
|---|---:|---:|
| Inventory/planning job | 103s | 58s |
| Detail job window | 387s | 140s |
| Assembly job | 12s | 10s |
| Complete API input job window | 510s (8m30s) | 215s (3m35s) |

The full read-only primary workflow job window was 245s (4m05s). This excludes actual production writes and downstream publication, so it is not a measured live end-to-end production runtime. The baseline coordinator had a cold npm cache; subsequent warm-cache behavior contributes to its improvement. The worker comparison is the clearer concurrency/pacing result.

Reliable-budget pacing now measures the one-second minimum between request starts. Response latency fits inside that interval; the rate is not increased above one request start per second per runner. Missing headers retain the conservative full fallback. Twenty separate runners overlap the same 50-read bounds; no API observations are omitted and workers still cannot refresh OAuth.

Metadata-only benchmark [43761632697](https://github.com/toddaggie95/swc-personal-analytics/actions/runs/43761632697) resolved known and new input fingerprints in 1.504s and 1.418s, versus the live 37s full-report archive scan. This measures the migration-seed path; later receipt downloads add a small request. New publication intents and receipts are tiny metadata artifacts, separate from the unchanged full report archives.

Before any publisher writes, a durable intent invalidates older publication knowledge. A verified final/partial receipt records only known component states. Interrupted or unknown components require publication rather than inheriting older matches; Aâ†’Bâ†’A also republishes correctly. Alternating slots preserve prior retry state, and inherited completion markers are removed before forced writes. The legacy seed expires after the migration window; missing/expired evidence causes republication, never a stale skip. Artifact identity, trusted workflow origin, exact input hashes, ZIP contents and attempts are validated.

Regression coverage: 157 JavaScript checks plus 78 Python checks, including 28 receipt/failure/retry/migration tests. The next write-enabled run will establish the new live end-to-end runtime.

## Earlier serial-to-four-worker comparison

The bounded parallel export assembled all 1,013 tracked production shipyards in **7m54s**, compared with **89m03s** for the successful serial collector: approximately **11.3 times faster**, or **91.1% less elapsed time**. These are collection-stage measurements; downstream Google Sheets comparisons and previews are excluded.

| Measurement | Serial baseline | Bounded production export |
|---|---:|---:|
| Validation run | [43677894333](https://github.com/toddaggie95/swc-personal-analytics/actions/runs/43677894333) | [43683569113](https://github.com/toddaggie95/swc-personal-analytics/actions/runs/43683569113) |
| Production detail coverage | 1,013 | 1,013 |
| Detail workers | One serial process | 21 fresh runners, maximum four concurrent |
| Batch sizes | Entire target list | 20 Ã— 50, then 13 |
| Collection elapsed | 5,343,116 ms | 474,448 ms including planning, setup, transfer and assembly |
| Pacing wait | 5,030,177 ms, 94.1% of elapsed | 944,317 ms summed across parallel workers |
| Large quota-reset waits | 495s + 3,585s = 68m | None in completed worker logs |
| Detail requests | 1,013, within 1,053 total data requests | Exactly 1,013 across detail workers; no retries |
| Assembly | Serial completion | 1,013 completed, zero missing, 21/21 batches |
| Worker OAuth refresh | Serial coordinator may refresh | Zero by design: access-only token files and a refresh method that always refuses |

The serial value comes from `PRODUCTION_API_COMPLETE` in job 132701949954. Its fetch time was 212,046 ms. Batched wall time uses the first plan-job log at **06:11:38.917 UTC** through the last assembly-job log at **06:19:33.366 UTC**, November 15. This includes more workflow overhead than the serial collector's internal timer, so it is a conservative comparison rather than identical timer boundaries.

The coordinator job occupied 69.3s; assembly occupied 10.4s. Detail collection spanned approximately **06:12:59.128â€“06:19:12.890 UTC**, or **6m13.8s**, inferred from each batch's completion timestamp and elapsed time. Detail jobs occupied a 6m21.3s wall-clock window. Summed collection time across workers was 18m53.8s; summed job time was 22m34.6s. Setup, transfer and cleanup added about **3m40.8s in aggregate**, averaging **10.5s per worker**; overlapping workers mean this is not additive wall-clock delay. Full 50-read batches took 53.6â€“58.5s; median across all batches was 55.5s. The last 13-read batch took 14.6s.

All 20 full workers ended with quota limit **600**, remaining **550**. The 13-read worker ended with **587** remaining. Every worker reported the same reset timestamp, while overlapping workers retained independent remaining counts. These production observations corroborate the prior 48-batch audit, where every fresh runner's first response reported 599 remaining and each 50-read batch ended at 550. The earlier review was too conservative about using that direct evidence. The implemented maximum-four fresh-runner design follows the repeatedly observed runner budgets; it does not assume unlimited capacity or increase concurrency beyond the validated setting. Each runner enforces its own observed reserve, reset and fallback rules.

The coordinator performs four paginated inventories once, with one cached character/faction lookup. At the validated inventory counts this requires 40 data reads: 13 station pages, 26 material pages and one character lookup. Together with worker reads, the planned data budget remains **1,053**, matching the measured serial baseline. Coordinator request count is derived from pagination and source inspection; workers' 1,013 calls are directly logged. The speedup comes from eliminating long shared-runner waits and overlapping bounded batches, not omitting required observations. OAuth exchanges are separate from this count.

## Implemented improvements

| Impact | Change | Evidence and limits |
|---|---|---|
| Big | One OAuth/inventory coordinator, maximum-twenty fresh-runner detail batches, exact encrypted assembly | Benchmark 43762988776: all 21 workers and assembly passed, 1,013 completed, zero missing. Workers have no refresh token file, client secret or secret-writer credential. |
| Big | Validated partial checkpoints and resume | Worker successes are encrypted after each 25 details and on normal exit, uploaded on completion/failure, and assembled into compatible progress. Resume binds target identity, owner, contract and timestamps. Hard runner loss can still lose work not yet uploaded. |
| Medium | Failure categories and performance telemetry | Fixed labels, request counts, elapsed time, pacing waits and quota summaries avoid exposing payloads or OAuth responses. |
| Medium | Freshness gates | Two-hour observation limit, checked during plan selection/assembly and after sheet comparisons and before production sealing/writes/acceptance. Captures remain observations over time, not transactional snapshots. |
| Small | Reuse character/faction mapping | Four inventory syncs share one character response, saving three data reads. |
| Small | Cache npm download data against the pinned lockfile | Coordinator/detail jobs retain `npm ci`. Private data and tokens are excluded from dependency caches. |
| Medium | Compact verified publication intents/receipts | Known/new lookups measured 1.4â€“1.5s; incomplete writes remain recoverable without trusting stale markers. |

The production path already filters details to tracked shipyards: **1,013 instead of all 2,375 stations**, a 57.3% reduction. Complete station and material inventories remain available for registry and HAS validation. Pagination already uses 200 items per request.

Relevant code: `collect-production-batches.ts`, `production-batches.mjs`, `assemble-production-batches.mjs`, `production-progress.mjs`, `production-read-pacer.ts`, and `.github/workflows/production-api-inputs.yml`. Production Sync owns the OAuth lock; the reusable collection workflow does not reacquire it. Coordinator-only refreshes persist before API reads continue. Workers stop before token expiry and cannot refresh.

## Remaining opportunities

| Impact | Opportunity | Recommendation |
|---|---|---|
| Big, conditional | Incremental refresh from an authoritative change/version signal | No verified change feed exists in the reviewed code. Production can change without inventory metadata changing. Do not skip details based on names, coordinates, tooling, prior idle state or `working` alone. Validate change semantics and periodic full reconciliation first. |
| Medium | Limit observation skew on larger captures | Retain timestamps and freshness gates. Inventory, materials and detail are captured at different times. Resume is recovery, not permission to reuse yesterday's production status. |
| Small | Reduce setup/transfer overhead | Measured average is 10.5s per worker. Profile dependency installation and whole-plan transfer if more improvement is needed. Preserve validation and encryption. |
| Small | Reuse local parsing/normalization | About 7,279 inventory entities are small relative to network waits. Preserve atomic writes, hashes, raw private evidence and canonical validation. |

The pinned SDK's 600-per-hour comment does not fully document server quota keying. Runtime headers provide empirical evidence for the current bounded layout. Retain reserve/reset checks and stop on unexpected behavior rather than extrapolating unlimited independent capacity.

## Historical audit reference

The earlier full-station capture read 2,375 stations in 48 bounded batches, with **12m41s** between first and last HTTP request. Summed worker elapsed was 39m08s: pacing 32m42s (83.5%), fetch 5m35s (14.3%), body reads 38s (1.6%). Median batch elapsed was 49.1s. Those figures describe the research audit, not the current 1,013-target production capture.

The failed serial integration at c20c8a6646a7e9e5b131213a39e1ed844a8cd816 lacked durable artifacts and safe failure categories. These were fixed before the successful serial baseline and parallel validation. The older description of one shared budget with no runner parallelism is superseded by the measured coordinator/worker design above.

Final validation: run 43683569113 passed both downstream API and Manual Export previews. All 1,087 orders match across sources, including ship, quantity, Started, status and readiness. All 2,375 compared station identities/metadata match; tracked shipyard operation fields match. The newer API snapshot has 13 hub HAS and 18 System HAS deltas versus the older exports; all reconcile exactly to source lot changes. Validation performed no production sheet writes, Drive cleanup or batch acceptance. Detailed private lot traces are retained locally.
