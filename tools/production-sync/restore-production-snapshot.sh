#!/usr/bin/env bash
set -euo pipefail
output="$1"
mkdir -p "$output"
current="${GITHUB_RUN_ID:?}"
repo="${GITHUB_REPOSITORY:?}"
history="$output/previous-overview-artifact"
mkdir -p "$history"
runs=$(gh api "repos/$repo/actions/runs?branch=${GITHUB_REF_NAME:?}&status=success&per_page=100" --jq '.workflow_runs[] | select(.name == "SWC production overview readiness and publish") | [.id, .event] | @tsv')
while IFS=$'\t' read -r previous event; do
  if [[ "${ACCEPTED_HISTORY_ONLY:-false}" == "true" && "$event" != "workflow_run" && "$event" != "workflow_dispatch" ]]; then continue; fi
  [[ -n "$previous" ]] || continue
  [[ "$previous" -lt "$current" ]] || continue
  echo "Checking previous successful overview run: $previous"
  history="$output/previous-overview-artifact/$previous"
  mkdir -p "$history"
  if ! gh run download "$previous" -R "$repo" -n swc-production-overview-readonly -D "$history"; then
    echo "Artifact unavailable for $previous; checking earlier run."
    continue
  fi
  if [[ "${ACCEPTED_HISTORY_ONLY:-false}" == "true" ]]; then
    if [[ ! -s "$history/accepted-has-verification.json" ]]; then continue; fi
    if ! python3 - "$history/accepted-has-verification.json" <<'PY'
import json,sys
try:
    with open(sys.argv[1]) as f: marker=json.load(f)
    assert marker.get("verified") is True
    assert str(marker.get("hasRunId","")).isdigit()
except (OSError,ValueError,AssertionError):
    raise SystemExit(1)
PY
    then
      echo "Invalid accepted HAS provenance in $previous; skipping."
      continue
    fi
  fi
  if [[ ! -s "$history/production-change-snapshot.json" ]]; then
    echo "No station snapshot in $previous; checking earlier run."
    continue
  fi
  cp "$history/production-change-snapshot.json" "$output/previous-production-snapshot.json"
  echo "Restored station snapshot from $previous"
  exit 0
done <<< "$runs"
echo "No previous successful station snapshot available; baseline will be created."
