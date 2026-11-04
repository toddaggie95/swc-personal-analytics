#!/usr/bin/env bash
# Persist a rotated SWC OAuth token to the isolated GitHub environment.
# Never print token contents; require explicit GitHub secret-writer credentials.
set -euo pipefail
: "${SWC_PRIVATE_DIR:?SWC_PRIVATE_DIR required}"
: "${SWC_SECRET_WRITER_TOKEN:?SWC_SECRET_WRITER_TOKEN required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
token_file="$SWC_PRIVATE_DIR/tokens.json"
test -s "$token_file" || { echo "No SWC OAuth token file to persist" >&2; exit 1; }
node --input-type=module - "$token_file" <<'NODE'
import {readFileSync} from 'node:fs';
const t=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(typeof t.accessToken!=='string'||!t.accessToken||!Number.isFinite(t.expiresAt)||
   typeof t.refreshToken!=='string'||!t.refreshToken) {
  console.error('Refusing to persist incomplete OAuth credentials');process.exit(1);
}
NODE
GH_TOKEN="$SWC_SECRET_WRITER_TOKEN" gh secret set SWC_OAUTH_TOKENS_JSON \
  --repo "$GITHUB_REPOSITORY" --env swc-api-shadow < "$token_file"
echo "Updated isolated SWC OAuth environment secret (token values withheld)."
