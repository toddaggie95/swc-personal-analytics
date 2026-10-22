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

## End-to-end audited dry run

After reviewing the station candidate report and populating all hub `memberStationUids`, run:

```sh
node tools/production-sync/audited-run.mjs \
  --config /path/approved-destinations.json \
  --tff-materials /path/tff-materials.csv \
  --tjo-materials /path/tjo-materials.csv \
  --tff-stations /path/tff-stations.csv \
  --tjo-stations /path/tjo-stations.csv \
  --baseline /path/live-has-baseline.json \
  --out /path/audited-dry-run.json
```

The baseline is a JSON object mapping `"sheet|zeroBasedRow|zeroBasedColumn"` to numeric HAS values, for **all 21 materials at every destination**. An absent baseline cell fails closed. This CLI writes **only the JSON report**, not Google Sheets. It exits nonzero on errors and includes pile provenance and unallocated inventory.

Do not use `audited-workbook-layout.json` as an approved config: its hub membership arrays are intentionally empty. A separate, validated manifest must be created before production synchronization.

## Corrected audit finding

A direct check of all 37 one-off station UIDs against the deduplicated exports found Harrin (10,14) was mislabeled `5:17800` (a Saki shipyard). The correct UID is **`5:17856`**, confirmed as Harrin Shipyard IV at (10,14). The live workbook and layout snapshot were corrected. All 37 one-off UID/system/coordinate/type tuples now match the exports.

## Explicit production-order membership (new)

The live audited workbook now has a versioned snapshot of **945 explicit production orders**, spanning 18 systems with active hub blocks: `audited-production-orders.json`. Each row records the hub destination ID, system, exact station coordinate, ship, and spreadsheet row. **No coordinate is assigned to more than one hub block in the current snapshot.** Rakhuuun and Teljkon use one-off shipyard entries instead of hubs.

All 11 previously ambiguous shipyards are uniquely identified by explicit order coordinates, including Tholatin IV's two split blocks and Lexrul's two untagged shipyards. The previously material-bearing Tholatin UID `5:19840` also has exact 21-material HAS parity.

Generate a **review-only** shipyard membership proposal:

```sh
node tools/production-sync/propose-membership.mjs \
  --layout tools/production-sync/audited-workbook-layout.json \
  --orders tools/production-sync/audited-production-orders.json \
  --tff-stations /path/tff-stations.csv \
  --tjo-stations /path/tjo-stations.csv \
  --out /path/membership-proposal.json
```

This explicitly matches shipyard UIDs by system and audited production-order coordinates, excludes known one-off UIDs, and reports unlisted shipyards, ambiguous coordinates, and empty hubs. **Do not use the proposal as an approved inventory configuration**: other station types holding hub inventory (depots/factories) must still be reviewed and allocated, and every HAS total must pass a live per-material comparison. The existing dry-run remains fail-closed.
