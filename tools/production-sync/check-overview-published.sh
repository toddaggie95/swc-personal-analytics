#!/usr/bin/env bash
set -euo pipefail
output="$1"
current="${ACCEPTED_RUN_ID:-}"
[[ "$current" =~ ^[0-9]+$ ]] || exit 1
mkdir -p "$output/publish-history"
runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?branch=main&status=success&per_page=100" --jq '.workflow_runs[] | select(.name == "SWC production overview readiness and publish") | .id')
for run in $runs; do
  [[ "$run" != "$GITHUB_RUN_ID" ]] || continue
  dir="$output/publish-history/$run"
  mkdir -p "$dir"
  if ! gh run download "$run" -R "$GITHUB_REPOSITORY" -n swc-production-overview-readonly -D "$dir" >/dev/null 2>&1; then continue; fi
  if [[ -s "$dir/accepted-has-verification.json" && -s "$dir/production-change-snapshot.json" ]]; then
    previous=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("hasRunId",""))' "$dir/accepted-has-verification.json")
    same_exports=false
    if [[ -s "$dir/swc-exports/export-manifest.json" && -s "$output/swc-exports/export-manifest.json" ]]; then
      if python3 - "$dir/swc-exports/export-manifest.json" "$output/swc-exports/export-manifest.json" <<'PY'
import json,sys
def identity(path):
    with open(path) as f: manifest=json.load(f)
    return sorted((x["owner"],x["kind"],x["sha256"]) for x in manifest["files"])
assert len(identity(sys.argv[1])) == 4
assert identity(sys.argv[1]) == identity(sys.argv[2])
PY
      then same_exports=true; fi
    fi
    if [[ "$previous" == "$current" || "$same_exports" == true ]]; then
      echo "publish=false" >> "$GITHUB_OUTPUT"
      echo "Already published HAS run $current"
      exit 0
    fi
    break
  fi
done
echo "publish=true" >> "$GITHUB_OUTPUT"
