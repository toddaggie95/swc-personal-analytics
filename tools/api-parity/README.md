# Kashyyyk web/API shadow parity audit

This directory contains a **read-only** comparison. It does not call Google Sheets, Google Drive, SWC API, or the production publishing workflow.

## Run

```powershell
python tools/api-parity/compare-kashyyyk.py --web-dir "C:\path\to\four-web-csvs" --api-dir "$env:LOCALAPPDATA\SWC Personal Analytics\normalized\audit-capture" --out-dir "audit-results"
```

The web directory must contain `tff-materials.csv`, `tjo-materials.csv`, `tff-stations.csv`, and `tjo-stations.csv`. The API directory must contain **exactly one** normalized Kashyyyk JSON file for each faction and kind. Copy the four snapshots into an isolated directory rather than pointing at a directory containing multiple runs.

Outputs: `summary.json`, `discrepancies.csv`, `station-has-comparison.csv`.

## Interpretation

- Compare by unique UID, never row order; fail on duplicate UIDs or wrong system.
- Compare material quantity, type, owner, container UID/type, and location fields; compare station tooling and production actions.
- A blank web coordinate populated by API is **informational**, not a claim that material is production-eligible. Six TJO piles in the Nov 3 capture have this known shape.
- A nonblank location mismatch (e.g. the Mammoth pile's system Y) remains a real observation difference, potentially caused by capture timing.
- Station material HAS is station-contained inventory only, deduplicated by pile UID across factions; ship cargo and ground facilities are excluded.
- Do not interpret unknown API production-action fields as stopped.
- This is **not** an end-to-end equivalence test for System HAS, Production Overview or Production Changes. Those require the exact production assignment matrix, accepted prior snapshot, and execution of both production calculators in an isolated test harness.
- No production workflow or sheet modifications are performed by this tool.

## Nov 3 acceptance baseline

TFF: 33 material piles, 81 stations. TJO: 173 material piles, 195 stations. All 482 UIDs matched; station HAS: 60 of 60 material cells matched. Forty-two field-level differences were blank web location fields on six TJO piles; one nonblank system Y mismatch was observed for the Mammoth material pile. These are **fixture observations**, not hard-coded exceptions.

## Authoritative production HAS comparison

Run this against the **same four API snapshots and four web CSVs** with the repository's audited destination manifest:

```powershell
node tools/api-parity/compare-production-has.mjs --web-dir "C:\path\to\web" --api-dir "C:\path\to\api" --manifest tools/production-sync/audited-workbook-layout.json --out "audit-results/production-has.json"
```

This path invokes `buildLedger()` from the existing production implementation and compares **all material HAS target cells for Kashyyyk**, including zero-quantity cells, rather than only populated station/material combinations. It is read-only and will fail on absent assigned stations or invalid material locations. Unknown station production status is preserved as `null` by the adapter; it is not treated as stopped. This check **does not yet establish readiness or Production Changes parity**.

CI tests run on pull requests; they do not access private snapshots or write to Sheets.

## November 3 independent full-destination acceptance result

An independent local calculation against the November 3 web and API snapshots and the repository's audited Kashyyyk membership list found:

- 22 destinations, 196 distinct assigned station UIDs
- 196/196 assigned station UIDs present in both datasets
- 462/462 destination/material HAS target cells equal (22 destinations × 21 materials)
- Zero station-material quantity differences and zero invalid assigned-container associations
- 206 unique material piles and 276 stations in each source

The independent Python result is retained in the conversation audit artifact `authoritative-has-independent-check.json`; the private captures are **not** committed to GitHub. This is supporting evidence, not a claim that the JavaScript CLI has been executed with the real captures. Full readiness and Production Changes equivalence remain pending.

## Readiness and Production Changes parity gate

When the existing production-readiness pipeline has generated **two read-only outputs** using identical audited assignments, ship bills, priority and prior snapshot, compare them with:

```powershell
node tools/api-parity/compare-readiness.mjs --web web-readiness.json --api api-readiness.json --previous previous-accepted-snapshot.json --out readiness-parity.json
```

Omit `--previous` to compare readiness alone. The gate invokes the production repository's `snapshotFromOverview` and `compareProductionSnapshots` functions, rather than recreating change-history logic. It reports discrepancies in station IDs, assignments, quantities, status, material bills, shortages, and change events. **This gate does not generate the two readiness outputs**; producing them from the same production configuration is a separate integration task. Do not claim production parity until that task is completed and the gate passes with real captures.

## November 3 production-operation completeness gate

The normalized station API capture has incomplete operations coverage:

| Source | Production actions populated | Tooling populated | Queue populated |
| --- | ---: | ---: | ---: |
| TFF (81 stations) | 0 | 0 | 0 |
| TJO (195 stations) | 101 | 173 | 136 |

The corresponding web CSV fields are also blank for every station where API production actions or tooling are null. **Blank is not proof of idle, stopped, or untooled.** Do not mark readiness/Production Changes parity verified solely from these snapshots. Acquire complete operation details or explicitly establish the missing-data semantics before enabling API-derived production status. Material HAS parity (462/462) is independent of this limitation.

### Shipyard-scoped follow-up (November 3)

Readiness requires production-action coverage for **shipyards**, not unrelated station types. The Kashyyyk API captures contain 173 TJO shipyards (101 known production-action observations, **72 unknown**) and zero TFF shipyards. Tooling is populated for all 173 TJO shipyards. The 81 TFF stations and 22 TJO depots are excluded from the shipyard readiness coverage gate. Missing production actions must not be interpreted as idle; refresh or enrich those 72 station details before claiming API readiness parity. The full-station counts above remain descriptive, not readiness acceptance criteria.

## Targeted missing-detail manifest

Generate the list of shipyards whose production operations are still unknown:

```powershell
node tools/api-parity/missing-operation-details.mjs "C:\path\to\api-snapshots" "audit-results\shipyard-detail-retries.json"
```

The output contains faction, station UID and missing fields. This is a **retry plan, not a live API collector**. The existing collector's `enrichFactionStations` uses persistent `station-details-*.json` checkpoints and SWC rate-aware pacing, but currently skips entries already cached with `observedAt` and `tags`. Therefore **simply rerunning the existing command will not necessarily refresh incomplete cached production actions**. The next collector change must selectively invalidate or refresh only incomplete shipyard detail entries, preserve all complete entries, and keep the API's null/empty semantics. Do not delete the entire checkpoint or bypass pacing. This collector code currently resides on the separate `feature/api-csv-audit` branch, so integration requires a deliberate branch merge/cherry-pick rather than assuming it is in PR #54.

## Same-snapshot Kashyyyk readiness execution

Use the **same** captured workbook snapshot for both sources. This command invokes the existing `calculateOverviewSnapshot` production calculator twice, once per source, and compares each order by UID. The snapshot must contain the audited destination manifest, one-based `rowsBySystem.Kashyyyk`, and `shipRows` from the Ships tab. The existing `capture-overview-snapshot.py` can produce the full workbook snapshot using authorized Google API credentials; do not commit snapshots or credentials.

```powershell
node tools/api-parity/run-readiness-parity.mjs --snapshot "C:\\path\\to\\workbook-snapshot.json" --web-dir "C:\\path\\to\\four-web-csvs" --api-dir "C:\\path\\to\\four-api-jsons" --out "C:\\path\\to\\readiness-parity.json"
```

The web directory needs `tff-stations.csv`, `tjo-stations.csv`, `tff-materials.csv`, `tjo-materials.csv`. The API directory needs exactly one Kashyyyk normalized JSON file per faction/kind. Do not point it at the entire normalized directory containing multiple captures. The script is read-only and fails closed on missing station UIDs, coordinate/assignment drift, invalid bills, or inventory differences. The November 3 historical sheet baseline was 101 building, 1 ready_now, 2 transfer, 69 blocked; 23 unassigned stations were also reported. These totals must **not** be used as a gate for a later workbook capture. To validate against live totals, include `expectedKashyyykCounts` in the snapshot, sourced from the same captured workbook (e.g. `{ "building": 101, "ready_now": 1, "transfer": 2, "blocked": 69 }` only for the November 3 capture). Without this field, the runner checks web/API order parity but explicitly reports `baselineChecked: false`. **Do not report full readiness parity until this runner has been executed against the real snapshot and returns matched.**
