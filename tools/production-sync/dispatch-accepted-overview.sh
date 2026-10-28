#!/usr/bin/env bash
set -euo pipefail
: "${GITHUB_REPOSITORY:?}"
: "${GITHUB_RUN_ID:?}"
: "${GH_TOKEN:?}"
: "${ACCEPTANCE_REPORT:?}"
: "${HAS_WRITE_REPORT:?}"
python3 - <<'PY'
import json,os
with open(os.environ['ACCEPTANCE_REPORT']) as f: acceptance=json.load(f)
with open(os.environ['HAS_WRITE_REPORT']) as f: write=json.load(f)
if acceptance.get('status')!='accepted':raise SystemExit('Refusing overview dispatch: export batch not accepted')
if write.get('status')!='verified':raise SystemExit('Refusing overview dispatch: HAS not verified')
if len(acceptance.get('acceptedFiles',[]))!=4:raise SystemExit('Refusing overview dispatch: expected four accepted exports')
print('Verified HAS batch; ready to dispatch overview for run',os.environ['GITHUB_RUN_ID'])
PY
gh workflow run production-overview-readonly.yml -R "$GITHUB_REPOSITORY" --ref feature/production-overview-readiness -f accepted_batch_run_id="$GITHUB_RUN_ID"
echo "Dispatched production overview for accepted HAS run $GITHUB_RUN_ID"
