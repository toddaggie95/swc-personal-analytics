#!/usr/bin/env bash
set -euo pipefail
# Collect the complete production registry without CSV comparison.
mapfile -t systems < <(python3 -c 'import json; d=json.load(open("../production/tools/production-sync/systems.addresses.json")); print("\n".join(x["system"] for x in d["systems"]))')
test "${#systems[@]}" -eq 20
for system in "${systems[@]}"; do
  echo "Collecting API inventory: $system"
  for faction in tff tjo; do
    npx tsx src/cli/index.ts "sync:faction-materials:$faction" --system "$system" > "/tmp/swc-${faction}-materials.log" 2>&1 || { echo "::error::API material collection failed for $system/$faction"; exit 1; }
    npx tsx src/cli/index.ts "sync:faction-station-inventory:$faction" --system "$system" > "/tmp/swc-${faction}-stations.log" 2>&1 || { echo "::error::API station collection failed for $system/$faction"; exit 1; }
  done
  sleep 3
done
echo "API inventory collected for all 20 systems."
