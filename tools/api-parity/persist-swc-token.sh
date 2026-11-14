#!/usr/bin/env bash
# Persist a rotated SWC OAuth token to the isolated GitHub environment.
# Never print token contents; require explicit GitHub secret-writer credentials.
set -euo pipefail
: "${SWC_PRIVATE_DIR:?SWC_PRIVATE_DIR required}"
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
# Never overwrite durable state with an unchanged/rejected credential snapshot.
comparison="$SWC_PRIVATE_DIR/initial-tokens.json"
[ ! -s "$SWC_PRIVATE_DIR/persisted-tokens.json" ] || comparison="$SWC_PRIVATE_DIR/persisted-tokens.json"
if [ ! -s "$comparison" ]; then
  echo "Missing OAuth persistence baseline; refusing unverified overwrite" >&2
  exit 1
fi
if node --input-type=module - "$token_file" "$comparison" <<'NODE'
import {readFileSync} from 'node:fs';
const [a,b]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8')));
process.exit(a.accessToken===b.accessToken && a.refreshToken===b.refreshToken && a.expiresAt===b.expiresAt ? 0 : 1);
NODE
then
  echo "OAuth credentials unchanged or already persisted; no secret update."
  exit 0
fi
: "${SWC_SECRET_WRITER_TOKEN:?SWC_SECRET_WRITER_TOKEN required}"
GH_TOKEN="$SWC_SECRET_WRITER_TOKEN" gh secret set SWC_OAUTH_TOKENS_JSON \
  --repo "$GITHUB_REPOSITORY" --env swc-api-shadow < "$token_file"
echo "Updated isolated SWC OAuth environment secret (token values withheld)."
