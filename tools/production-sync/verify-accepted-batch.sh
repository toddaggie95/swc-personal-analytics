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
gh run download "$run" -R "$repo" -n swc-audited-ledger -D "$output/accepted-has"
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
PY
echo "verified=true" >> "$GITHUB_OUTPUT"
