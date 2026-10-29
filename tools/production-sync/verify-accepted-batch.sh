#!/usr/bin/env bash
set -euo pipefail
output="$1"
run="${ACCEPTED_RUN_ID:?}"
repo="${GITHUB_REPOSITORY:?}"
[[ "$run" =~ ^[0-9]+$ ]] || { echo "Invalid run ID"; exit 1; }
status=$(gh api "repos/$repo/actions/runs/$run" --jq '.conclusion')
workflow=$(gh api "repos/$repo/actions/runs/$run" --jq '.name')
[[ "$status" == "success" && "$workflow" == "SWC production CSV dry run" ]] || { echo "HAS run not successful or wrong workflow"; exit 1; }
mkdir -p "$output/accepted-has"
if ! gh run download "$run" -R "$repo" -n swc-audited-ledger -D "$output/accepted-has"; then
  if [[ "${ALLOW_UNACCEPTED_NOOP:-false}" == "true" ]]; then
    echo "Upstream HAS run has no accepted batch artifact; downstream publication skipped."
    echo "verified=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  exit 1
fi
if [[ ! -s "$output/accepted-has/batch-acceptance-report.json" || ! -s "$output/accepted-has/has-write-report.json" ]]; then
  if [[ "${ALLOW_UNACCEPTED_NOOP:-false}" == "true" ]]; then
    echo "Upstream completed without accepted HAS writes; downstream publication skipped."
    echo "verified=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  echo "Missing accepted HAS report" >&2
  exit 1
fi
python3 - "$output/accepted-has" <<'PY'
import json,os,sys
folder=sys.argv[1]
with open(os.path.join(folder,'batch-acceptance-report.json')) as f: acceptance=json.load(f)
with open(os.path.join(folder,'has-write-report.json')) as f: write=json.load(f)
print('Acceptance report:',json.dumps(acceptance)[:1200])
print('HAS write report:',json.dumps(write)[:1200])
if acceptance.get('status')!='accepted' or write.get('status')!='verified':raise SystemExit('Batch not accepted and HAS not verified')
if len(acceptance.get('acceptedFiles',[]))!=4:raise SystemExit('Accepted export file count is not four')
with open(os.path.join(folder,'swc-exports','export-manifest.json')) as f: original=json.load(f)
with open(os.path.join(os.environ['RUNNER_TEMP'],'swc-exports','export-manifest.json')) as f: current=json.load(f)
def identities(manifest):return {(x['id'],x['sha256']) for x in manifest['files']}
if len(identities(original))!=4 or identities(original)!=identities(current):raise SystemExit('Current exports do not match accepted HAS batch')
if {x['id'] for x in original['files']}!=set(acceptance['acceptedFiles']):raise SystemExit('Acceptance record does not match HAS manifest')
PY
printf '{"verified":true,"hasRunId":"%s"}\n' "$run" > "$output/accepted-has-verification.json"
echo "verified=true" >> "$GITHUB_OUTPUT"
