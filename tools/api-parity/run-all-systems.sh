#!/usr/bin/env bash
set -euo pipefail
# Read-only parity across the production system registry. Private UID-level reports
# stay under /tmp and are removed by the workflow cleanup step.
mapfile -t systems < <(python3 -c 'import json; d=json.load(open("../parity/tools/production-sync/systems.addresses.json")); print("\n".join(x["system"] for x in d["systems"]))')
failed=0
for system in "${systems[@]}"; do
  echo "::group::Parity: $system"
  collection_error=0
  for faction in tff tjo; do
    npx tsx src/cli/index.ts "sync:faction-materials:$faction" --system "$system" > "/tmp/swc-${faction}-materials.log" 2>&1 || collection_error=1
    npx tsx src/cli/index.ts "sync:faction-station-inventory:$faction" --system "$system" > "/tmp/swc-${faction}-stations.log" 2>&1 || collection_error=1
  done
  if [[ "$collection_error" -eq 1 ]]; then
    echo "RESULT $system COLLECTION_ERROR"
    failed=$((failed+1))
  elif python3 ../parity/tools/api-parity/compare-scoped-inventory.py --csv-dir /tmp/swc-parity-csv --api-dir /tmp/swc-private/normalized --system "$system" --out "/tmp/swc-parity-${#system}-${failed}.json"; then
    echo "RESULT $system PASS"
  else
    echo "RESULT $system DISCREPANCY"
    failed=$((failed+1))
  fi
  echo "::endgroup::"
  sleep 3
done
echo "SUMMARY total=${#systems[@]} failed=$failed passed=$(("${#systems[@]}"-failed))"
[[ "$failed" -eq 0 ]]
