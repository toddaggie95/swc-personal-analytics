# Production Sync source selection

The `SWC Production Sync` workflow supports `export_source=api` (default) and
`export_source=csv` (Manual Export). Clear `enable_has_writes` for a preview only.
The existing write, force-republish, and Manual Export cleanup controls remain.
Selecting a source does not itself start production inside SWC.

## Input and write contracts

API mode reads complete TFF/TJO inventories through the pinned collector. It
fetches operation details for shipyards in the production system registry.
Running state requires consistent action/queue evidence, exact tooling, and a
positive integer production quantity. Missing actions/queues use the previously
validated idle policy; tooling alone never means running. Unknown actions,
conflicting evidence, missing tracked operations, duplicate identities, and
ownership changes block conversion before any sheet write.

Both modes then use the same existing station registry, hub HAS, System HAS,
Started preflight, readiness, and publication validation code. A preview projects
validated HAS/Started proposals onto a copy of a captured workbook; it never
changes live cells. Dashboard, material matrix and Production Changes previews
use that projected workbook. Actual writes require manual dispatch with
`enable_has_writes=true`, a changed/forced batch, and successful validations.

API collection follows normal read pacing and is slower than importing exports.
Google authentication occurs after API collection so its access token is fresh
for workbook checks and writes. OAuth refresh saves rotated credentials locally
and to the isolated GitHub environment before further reads. All renewable
credential workflows share the same concurrency group.

The optimized collector uses the validated fresh-runner batch design: one OAuth
and inventory coordinator, at most 50 station details per separate runner, four
workers concurrently, and exact assembly before canonical conversion. The 1,013
tracked shipyards require 21 batches. All 48 prior full-audit runners independently
started at 599 remaining and ended at 550 after 50 reads, including concurrent
batches. Each runner conservatively shares its observed budget across endpoint
groups, retains five requests, and honors reset times. Workers cannot refresh:
their token files contain access tokens only, and they have no secret writer.
Character/faction mapping is reused by the coordinator.

Completed station operations are saved incrementally and retained in the
authenticated encrypted `swc-api-progress` artifact. Set `api_resume_run_id` to a
prior run to resume compatible progress: fresh inventories must produce the same
exact target/owner/system/type plan and production contract. Duplicate, malformed,
changed or older-than-two-hour checkpoints stop collection. Complete coverage and
freshness are required before canonical conversion. Partial evidence never
authorizes sheet writes. This recovery artifact uses the retained environment
snapshot key and excludes all OAuth storage.
The coordinator has a 12-minute soft deadline in its 15-minute job; each worker
has an eight-minute soft deadline in its ten-minute job. Encrypted per-batch
artifacts retain successes independently; assembly also emits a merged resumable
checkpoint when coverage is incomplete. The older serial collector retains its
105-minute soft deadline within a 120-minute job for diagnostic use.
Freshness is rechecked after comparisons and immediately before sealing, writes,
and acceptance. Partial quota headers retain a previously observed reset time.

## Source fidelity downstream

Manual Export retains `accepted-batch.json`. API uses `accepted-api-batch.json`.
Switching to API does not replace Manual Export acceptance history or rename
Drive files. API canonical inputs carry a source marker and content hashes.

Before accepting API writes, the workflow seals the exact four canonical inputs
in an authenticated encrypted snapshot. Downstream publication checks the
successful upstream run, accepted write reports and manifest identities, restores
the encrypted snapshot, and verifies every file hash. It does not substitute
current web CSVs for accepted API data. A missing key or invalid snapshot stops
publication. Manual Export continues to verify its current Drive inputs against
the accepted export manifest.

`SWC_API_SNAPSHOT_PRIVATE_KEY` in `swc-api-shadow` protects accepted API archives.
It is created once by the authorized secret writer if absent; no SWC consent is
needed. Retain it: removing or rotating it makes older archives unreadable.
Private preview diagnostics use the retained local audit key instead. Public
preview summaries contain aggregate counts; OAuth credential files are excluded
from every archive. Do not replace hosted OAuth state with an old local bootstrap
token file after a hosted rotation.

## Validation

- Manual Export production dry run: run 43650810567, CSV job passed with writes
  disabled; 2,375 stations, 4,903 lots, 2,898 HAS cells and 1,087 orders.
- Fresh-job encrypted API handoff: run 43651938160 passed, restoring all four
  synthetic files exactly using the persisted key.
- Offline tests cover canonical conversion, ownership fields, positive running
  quantities, zero coordinates, source acceptance separation, snapshot integrity,
  write rejection, and projection without live mutation.
- Full API production dry-run result is recorded in the PR before merge.
- Optimized two-source preview: run 43677894333. Manual Export passed with all
  2,898 hub and 420 System HAS cells matching, zero Started changes, and 1,087
  reconciled orders. Actual faction dashboard, material matrix and grouped change
  presentation builders also passed against its captured inputs with network
  access explicitly forbidden. API collection remains under validation.

The earlier station/material parity reports remain source validation evidence.
Inventory snapshots are not simultaneous, and the nine known station-name
encoding differences do not alter UID-based matching or allocation.
