#!/usr/bin/env bash
set -euo pipefail
output="$1"
mkdir -p "$output"
current="${GITHUB_RUN_ID:?}"
repo="${GITHUB_REPOSITORY:?}"
history="$output/previous-overview-artifact"
mkdir -p "$history"
runs=$(gh api "repos/$repo/actions/runs?branch=feature%2Fproduction-overview-readiness&status=success&per_page=100" --jq '.workflow_runs[] | select(.name == "SWC production overview readiness and publish") | .id')
while read -r previous; do
  [[ -n "$previous" ]] || continue
  [[ "$previous" -lt "$current" ]] || continue
  echo "Checking previous successful overview run: $previous"
  rm -f "$history"/*
  if ! gh run download "$previous" -R "$repo" -n swc-production-overview-readonly -D "$history"; then
    echo "Artifact unavailable for $previous; checking earlier run."
    continue
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
