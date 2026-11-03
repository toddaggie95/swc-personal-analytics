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
