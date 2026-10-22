# Deterministic SWC production inventory engine (manual CSV mode)

Runs locally with Node.js >=20. No dependencies. **Never writes to Google Sheets**; produces a reviewable JSON ledger. Google Sheets HAS updates are a separate, guarded step.

```sh
cd tools/production-sync
npm run production:test
npm run production:sync -- --tff-materials /path/tff-materials.csv --tjo-materials /path/tjo-materials.csv --tff-stations /path/tff-stations.csv --tjo-stations /path/tjo-stations.csv --hubs /path/hubs.json --out /path/report.json
```

Hub JSON is an array of objects like `[{"id":"Kashyyyk-5,10","sector":"Mytaranor","system":"Kashyyyk","x":5,"y":10}]`. Hub definitions are explicit; do not infer centers from neighboring station lists. The algorithm uses the original Perl 3x3 match: sector and system equal, container type exactly `Stations`, abs(x-hub.x)<=1 and abs(y-hub.y)<=1. All 21 materials preserve the original order. TFF and TJO piles are deduplicated by unique pile ID; conflicting duplicates cause failure. Overlaps and unknown material types produce nonzero exit code (2), although the report is still emitted for review.

**Not yet implemented:** a reviewed 148-hub configuration, exact-cell spreadsheet writer, end-to-end Perl parity fixtures, or post-write Google Sheets verification. Do not automatically update a live workbook from this prototype until those gates pass.
