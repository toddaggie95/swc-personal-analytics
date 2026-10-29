#!/usr/bin/env bash
set -euo pipefail
output="$1"
current="${ACCEPTED_RUN_ID:?}"
mkdir -p "$output/publish-history"
runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?branch=main&per_page=100" --jq '.workflow_runs[] | select(.name == "SWC production overview readiness and publish" and .status == "completed") | .id')
for component in overview matrix changes; do
  printf '%s=false\n' "$component" >> "$GITHUB_OUTPUT"
done
for run in $runs; do
  [[ "$run" != "$GITHUB_RUN_ID" ]] || continue
  dir="$output/publish-history/$run"
  mkdir -p "$dir"
  if ! gh run download "$run" -R "$GITHUB_REPOSITORY" -n swc-production-overview-readonly -D "$dir" >/dev/null 2>&1; then continue; fi
  if [[ ! -s "$dir/swc-exports/export-manifest.json" ]]; then continue; fi
  if ! python3 - "$dir/swc-exports/export-manifest.json" "$output/swc-exports/export-manifest.json" <<'PY'
import json,sys
def identity(path):
    with open(path) as f: files=json.load(f)["files"]
    return sorted((x["owner"],x["kind"],x["sha256"]) for x in files)
assert len(identity(sys.argv[1])) == 4
assert identity(sys.argv[1]) == identity(sys.argv[2])
PY
  then continue; fi
  for component in overview matrix changes; do
    if [[ -s "$dir/published-$component.ok" ]]; then
      touch "$output/published-$component.ok"
    fi
  done
  # Legacy successful runs published all three areas, verified by their job conclusion.
  if [[ -s "$dir/production-change-snapshot.json" && -s "$dir/accepted-has-verification.json" ]]; then
    conclusion=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run" --jq '.conclusion')
    if [[ "$conclusion" == success ]]; then
      for component in overview matrix changes; do touch "$output/published-$component.ok"; done
    fi
  fi
done
for component in overview matrix changes; do
  if [[ ! -e "$output/published-$component.ok" ]]; then
    echo "$component=true" >> "$GITHUB_OUTPUT"
  fi
done
