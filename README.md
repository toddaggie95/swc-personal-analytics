# SWC Personal Analytics

Personal, read-only analytics foundation for Star Wars Combine Web Services.
Initial proof: **OAuth → authenticated character → owned station inventory → preserved raw responses**.

Implemented and tested offline. **Live proof is pending SWC application activation and a regenerated client secret.**
The original exposed secret must never be used. This project does not scrape game pages, bypass Anubis,
automate Darkness, accept a game password, or expose an arbitrary API proxy.

## Start locally

Use Node.js 18.18+ (a maintained Node LTS is recommended).

```sh
npm ci
npm run check
npm run status
```

Copy `.env.example` to `.env` when ready to configure the application. All example credential fields are blank.
`status`, tests and builds make no SWC requests. Live commands default to blocked.

After activation and secret regeneration, follow [the OAuth runbook](docs/oauth.md):

```sh
npm run auth:start
npm run auth:finish
npm run sync:stations
```

The Installed application redirect is fixed to `urn:ietf:wg:oauth:2.0:oob`. There is no localhost callback server.
Authorization codes are entered at a hidden terminal prompt, never as command arguments.
Only `character_auth`, `character_read`, `personal_inv_overview`, and `personal_inv_stations_read` are requested.

On success the CLI prints character UID, station count, page count and snapshot run ID. It never prints tokens,
raw character profiles, station names, secrets or authorization codes. The authorization URL intentionally
contains a client ID, random state, requested scopes and optional PKCE challenge; it contains no client secret.

## Stored output

Runtime files default to `%LOCALAPPDATA%/SWC Personal Analytics` on Windows or
`~/.local/share/swc-personal-analytics` elsewhere. This keeps private data out of this OneDrive repository.
`SWC_PRIVATE_DIR` can point to a private absolute directory outside the repository.

```text
tokens.json                 locally stored OAuth credentials (plaintext)
pending.json                short-lived OAuth session, removed before exchange
raw/<timestamp-uuid>/
  00001.body                untouched HTTP response body bytes after decompression
  00001.meta.json           timestamp, endpoint, pagination, HTTP status, SHA-256
  complete.json             written only after a complete, validated inventory run
normalized/<run-id>.json    minimal station records with raw-run provenance
```

Partial/failed runs keep raw evidence but have no completion marker. Paginated reads are not transactional:
changes during collection can invalidate a run. Inconsistent counts, duplicate UIDs and empty intermediate
pages fail instead of claiming success. A successful empty inventory is a valid result.

SQLite, entity-detail enrichment, galaxy/types joins, analytics and a small authenticated ChatGPT bridge
are deliberately deferred. See [architecture](docs/architecture.md), [security](docs/security.md),
and [SDK/API research and unresolved compatibility](docs/research.md).
