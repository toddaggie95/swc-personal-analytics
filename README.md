# SWC Personal Analytics

**Everyday use:** [Command cheat-sheet](docs/command-cheat-sheet.md) � commands, examples, export locations and troubleshooting.

Personal, read-only analytics foundation for Star Wars Combine Web Services.
Initial proof: **OAuth → authenticated character → owned station inventory → preserved raw responses**.

Implemented with offline regression tests and a successful live OAuth/character/station collection check.
New installations still require SWC application activation and a regenerated client secret.
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
Only `character_auth`, `character_read`, `personal_inv_overview`, `personal_inv_stations_read`, and
`personal_inv_ships_read`, `faction_inv_materials_read`, `faction_inv_stations_read`, and `faction_inv_facilities_read` are requested. Existing installations must
authorize again when adding ship or faction-material access.

For personally owned ships, run `npm run sync:ships` after reauthorization. It uses the same validated
pagination and private raw snapshots, with normalized records under `ships` and an `ownedShips` summary.
The count always comes from SWC; an expected user count is a comparison, never a hardcoded result.

For TFF and TJO owned materials, run `npm run sync:faction-materials` after granting material read access.
Use `npm run sync:faction-materials:tff` or `npm run sync:faction-materials:tjo` for just one faction. Each faction gets
an independent snapshot and status. Faction UIDs are resolved from the live authenticated character's
faction references, with exact name matching; game privileges still control what SWC permits you to see.
`materialLots` counts inventory records, not material units or tonnage. Available quantities are retained
per lot; absent quantities remain null. No totals are inferred from unknown quantities.

Exports now include `location.container`, `location.sector`, `location.system`, `location.planet`, and
`location.city`, each with name, UID and reference type where supplied by SWC. Missing references remain
null. Use these fields to positively identify Kashyyyk; a container alone is not evidence of its location.
Older exports are unchanged; rerun a sync to generate enriched files in the private `normalized` directory.

For faction-owned stations, authorize the added `faction_inv_stations_read` scope, then run
`npm run sync:faction-stations` (both factions), `npm run sync:faction-stations:tff`, or
`npm run sync:faction-stations:tjo`. Personal stations remain `npm run sync:stations`.

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

For faction-owned facilities, grant the added facility read permission using `npm run auth:start`
and `npm run auth:finish`, then run `npm run sync:faction-facilities -- --system "Kashyyyk"` (both factions),
`npm run sync:faction-facilities:tff -- --planet "Kashyyyk"`, or `npm run sync:faction-facilities:tjo -- --planet "Kashyyyk"`.
Operational detail enrichment is planned in [the OAuth runbook](docs/oauth.md#operational-detail-enrichment-plan).

Faction materials also accept optional `-- --system "Name"` or `-- --planet "Name"` for server-filtered location snapshots. See the [command cheat-sheet](docs/command-cheat-sheet.md#materials-optional-system-or-planet-refresh).
