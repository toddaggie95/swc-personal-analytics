# SWC production sync: lifecycle and recovery

## Proven synchronization
The workflow `.github/workflows/swc-production-dry-run.yml` validates four CSV exports, deduplicates material piles, audits station ownership and mappings, compares 2,898 Production HAS and 420 System HAS values, and optionally writes changed HAS cells. The write path checks existing values immediately before writing and reads back every updated cell. Export cleanup is **not enabled**.

Validated runs (2026-10-26):
- 40395342133: 33 HAS cells updated and read back successfully.
- 40395572660: all 3,318 HAS cells matched on a subsequent read-only run.

## Operator instructions
1. Upload exactly one complete new set of four TFF/TJO Materials/Stations exports to the configured Drive folder.
2. Run the workflow with `enable_has_writes=false` to validate and inspect differences.
3. Run with `enable_has_writes=true` only after review; confirm the `verified` count.
4. Run again read-only; expect zero differences for unchanged exports.
5. Keep previous exports. Do not manually remove accepted baseline exports until a durable batch manifest is implemented.

## Current lifecycle limitations
- `download-drive-exports.py` uses four hardcoded accepted baseline Drive IDs. A second complete new batch added while the first new batch remains in the folder will be rejected as ambiguous. **Do not accumulate multiple new batches in the same active folder.**
- The workflow's Google Drive OAuth scope remains read-only, regardless of folder Editor permissions.
- Audit artifacts are retained for 90 days; GitHub artifact storage is not permanent archival.
- Write-back is not a database transaction: if an API request succeeds partially or read-back fails, inspect the write report and rerun comparisons before any further update.

## Proposed safe lifecycle upgrade (not yet implemented)
1. Store a durable, versioned accepted-batch manifest with four Drive file IDs, SHA-256 hashes, source metadata, acceptance timestamp, workflow run ID, and spreadsheet verification result.
2. Before a new batch is accepted, ensure exactly four uniquely classified files belong to that batch; reject partial, duplicate, stale, or ambiguous batches.
3. Publish a batch audit record only after successful sheet read-back. On retries, recognize the already accepted batch by IDs and hashes.
4. Archive superseded files by moving them to a separate, non-active Drive folder, preserving at least one prior complete accepted batch; do not permanently delete.
5. Make archive actions independently opt-in and fail closed. Never archive files if spreadsheet write/read-back verification failed.
6. Add tests for two sequential new batches, interrupted updates, retries, ambiguous uploads, and archive failures before enabling archive actions.

## Operational safety
- Only HAS cells may be written. Do not alter formulas, formatting, production status, or station assignments.
- Advisory tooling/infotext warnings must be recorded but should not block an otherwise valid inventory update.
- Mapping conflicts, duplicate pile conflicts, missing exports, invalid calculations, and failed read-back verification must block acceptance.
- Keep archive/cleanup disabled until the accepted-batch state machine is implemented and tested.
