#!/usr/bin/env bash
set -euo pipefail
output="$1"
mkdir -p "$output"
current="${GITHUB_RUN_ID:?}"
repo="${GITHUB_REPOSITORY:?}"
previous=$(gh api "repos/$repo/actions/runs?branch=feature%2Fproduction-overview-readiness&status=success&per_page=100" --jq '.workflow_runs[] | select(.name == "SWC production overview readiness and publish") | .id' | awk -v current="$current" '$1 < current {print; exit}')
if [[ -z "$previous" ]]; then
  echo "No prior successful overview run; baseline will be created."
  exit 0
fi
echo "Previous successful overview run: $previous"
gh run download "$previous" -R "$repo" -n swc-production-overview-readonly -D "$output"
if [[ ! -s "$output/production-change-snapshot.json" ]]; then
  echo "Previous run does not contain a snapshot; baseline will be created."
  exit 0
fi
mv "$output/production-change-snapshot.json" "$output/previous-production-snapshot.json"
