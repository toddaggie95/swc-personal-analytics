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

## Live audited layout snapshot

`audited-workbook-layout.json` was generated from the live production workbook's 20 system tabs. It currently contains **128 hub blocks** and **11 aggregated one-off groups**, representing **37 individual standalone shipyard rows**. It records exact HAS destination columns and starting rows and all available one-off station UIDs. Hub `memberStationUids` are intentionally empty until independently reviewed.

To generate a station membership candidate report:

```sh
node tools/production-sync/destination-candidates.mjs \
  --layout tools/production-sync/audited-workbook-layout.json \
  --tff-stations /path/tff-stations.csv \
  --tjo-stations /path/tjo-stations.csv \
  --out /path/destination-candidates.json
```

This report highlights overlapping 3x3 candidates and excludes one-off shipyards from hub candidates. **Candidate proximity is not an allocation rule**. Station memberships must be explicitly approved using names, tags, UIDs, and the audited HAS totals before generating a production-ready manifest. The script never writes to Google Sheets.

Run the full tests with `node --test tools/production-sync/*.test.mjs`.
