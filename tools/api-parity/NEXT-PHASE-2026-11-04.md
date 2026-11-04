# API-to-production calculated-output parity: development plan

Status (2026-11-04): 20/20 system-scoped inventory comparisons passed with zero discrepancies. Final targeted Uogo`cor run: https://github.com/toddaggie95/swc-personal-analytics/actions/runs/41787381915 . This does not establish HAS/readiness/change parity.

## Immutable inputs and provenance
- Freeze the accepted four CSV exports, corresponding API captures, audited workbook destination assignments, Ships tab bills, per-system sheet rows and previous accepted Production Changes snapshot.
- Record source hashes, collection timestamps, and elapsed CSV/API capture skew. Material moves between captures are temporal differences, not necessarily calculation bugs.
- Preserve existing CSV HAS eligibility rules; changing inaccessible third-party container policy is a separate project.

## Implementation order
1. Generalize `tools/api-parity/validate-capture-set.mjs` beyond Kashyyyk. Fail closed on duplicate/missing UIDs, mismatched scope, incomplete datasets, and invalid quantities. Handle API-resolved blank CSV system locations only under the existing identity/ownership/container/quantity proof.
2. Generalize `compare-production-has.mjs` to selected system and full registry, invoking the production `buildLedger()` on both source adapters. Compare all destination/material cells, including zeros, then System HAS totals. Verify assigned station UID coverage and station-only material rules.
3. Generalize `run-readiness-parity.mjs` beyond Kashyyyk, using one identical captured workbook snapshot and the production `calculateOverviewSnapshot()` for both sources. Compare every order UID, assignment, ship, bill, shortage, quantity, started flag, status, and system totals.
4. Check complete production-action/tooling coverage for relevant shipyards before accepting readiness or Production Changes parity. Unknown API operations remain unknown, never implicitly stopped.
5. Feed the identical prior accepted production snapshot to `compareReadiness()` for event-level Production Changes parity; compare event identity, before/after and totals. Never advance the prior snapshot in shadow mode.
6. Add tests for all 20 systems, the Uogo`cor punctuation case, blank-location reconciliation, zero HAS cells, duplicate piles, missing operations, capture skew, and previous-snapshot mismatch.

## Acceptance gates
- 20/20 systems and all audited destinations covered.
- Zero unexplained HAS cell, overview order, or Production Changes event differences.
- Zero missing required shipyard operation details and zero invalid assigned-container associations.
- All snapshots have provenance and capture-time skew; regression suite passes.
- Shadow comparison never writes to the live Google Sheet, changes accepted snapshots, sends production notifications, or changes the authoritative CSV workflow.

## Existing reusable code
- `tools/production-sync/audited-inventory.mjs`: `buildLedger()`.
- `tools/production-sync/overview-snapshot.mjs`: `calculateOverviewSnapshot()`.
- `tools/api-parity/compare-production-has.mjs`: currently Kashyyyk-only.
- `tools/api-parity/run-readiness-parity.mjs`: currently Kashyyyk-only.
- `tools/api-parity/compare-readiness.mjs`: order and optional previous-snapshot change comparison.
- `tools/production-sync/capture-overview-snapshot.py`: workbook snapshot capture.

Do not describe inventory parity as production parity. Production publishing stays disabled until separately approved.
