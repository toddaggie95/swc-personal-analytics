# SWC API shadow export audit (isolated)

This directory is **not** part of the existing HAS, Production Overview, or
Production Changes ingestion workflows. Never use the live `SWC Exports`
folder as the output directory for API-generated files.

## Inputs

Prepare two **separate local directories** containing these four CSV names:

- `TFF-Stations.csv`
- `TJO-Stations.csv`
- `TFF-Materials.csv`
- `TJO-Materials.csv`

`manual/` must contain a frozen, verified manual export batch.
`api/` must contain independently downloaded SWC API exports. **The API
downloader is not implemented here yet.** The comparator does not contact
SWC, Drive, or Google Sheets.

## Run

```sh
python3 tools/api-shadow/compare-exports.py \
  --manual-dir /path/to/frozen-manual \
  --api-dir /path/to/api-shadow \
  --report /path/to/audit-output/comparison.json

python3 -m unittest discover -s tools/api-shadow -p 'test_*.py' -v
```

Exit 0 means the checked schema, entity identities, and critical fields match;
exit 1 means the candidate is **not safe to promote**. A passing comparison
is necessary but **not sufficient** for production use: material inventory
parity, production readiness, production change snapshots, timestamp
consistency, and authenticated API completeness still require independent
verification.

## Guardrails

- No production action or production file is edited by this feature.
- No OAuth secrets, Google credentials, or write permissions are used.
- Never store OAuth tokens, refresh tokens, or raw private exports in Git.
- Differences due to snapshots taken at different times are **reported**,
  never automatically accepted or silently normalized.
- Never promote API data to the existing ingestion pipeline automatically.
- SWC OAuth application activation and private API endpoint/field coverage
  remain unverified. Do not claim that an authenticated API download ran.

## Existing baseline

The accepted export batch is tracked by
`tools/production-sync/accepted-batch.json` on the production branch.
Compare API data against a frozen copy of those exact files, identified by
their recorded SHA-256 hashes, not arbitrary newer files.
