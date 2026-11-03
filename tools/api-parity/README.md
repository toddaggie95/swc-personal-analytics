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
