# Audited production destinations (v2 work in progress)

The audited workbook is the authority for **destination structure**; TFF/TJO exports remain authoritative for **current quantities**. This module is intentionally separate from the legacy 3x3 Perl-parity engine.

`audited-destinations.mjs` exports:
- `reconcileDestinations(materials, stations, destinations)`: deduplicates material pile UIDs, allocates station-held inventory to exact audited station UIDs, handles `hub` and `oneoff`, and returns per-material totals and pile provenance. Unknown, unallocated, and non-station piles remain visible separately. Conflicting duplicates and double assignment are errors.
- `planHasChanges(report, existing)`: computes a **dry-run only** list of HAS cell changes. Refuses missing baseline cells or any validation errors. It does not touch formulas or other columns.

Destination format (zero-based target coordinates):

```json
[
 {"id":"Kashyyyk-hub-5,10","kind":"hub","system":"Kashyyyk","sector":"Mytaranor","memberStationUids":["5:123","5:124"],"target":{"sheet":"Kashyyyk","hasColumn":2,"materialStartRow":13}},
 {"id":"Rakhuuun-oneoff-5:12320","kind":"oneoff","system":"Rakhuuun","stationUid":"5:12320","target":{"sheet":"Rakhuuun","hasColumn":2,"materialStartRow":134}}
]
```

These are **schema examples**, not a validated live destination file. Do not use example station UIDs as actual assignments.

## Required before enabling live writes

1. Export a complete destination manifest from the **current audited** Google Sheet and cross-reference every hub member and standalone UID against the TFF/TJO station exports. The workbook displays hub centers and production orders but does not necessarily contain the UID of every station in each ring. Do not infer memberships solely from coordinates where rings overlap.
2. Reconcile all destinations against fresh material exports. Every material pile must be accounted for as allocated, unallocated, or non-station; no pile may be counted twice.
3. Compare each of the 21 HAS values at every destination against the workbook. Resolve any differences and document whether they reflect new inventory or a structural discrepancy.
4. Add Google Sheets authentication, a **HAS-only** batch writer with pre-write snapshot checks and post-write readback, plus a safe dry-run CLI and CI fixtures. No write path exists in this branch yet.

Run tests: `node --test tools/production-sync/*.test.mjs` from the repository root.

Legacy `production-sync.mjs` and its 3x3 configuration remain unchanged for comparison; do not use them for automatic live HAS writes.
