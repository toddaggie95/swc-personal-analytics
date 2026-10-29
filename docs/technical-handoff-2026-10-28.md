# SWC Personal Analytics — technical handoff

Prepared 2026-10-28. Baseline: `898a2ac` on `codex/initial-oauth-inventory`.

## 0. Objective and non-negotiable boundary

Independently download TFF/TJO station and material data through the SWC public API, preserve the original responses, and compare with existing manual exports.

**The existing HAS, Production Overview, and Production Changes workflows must remain completely unchanged.** Do not change their sheets, scripts, triggers, formulas, schemas, ingestion steps or outputs. This project is an independent collection/comparison path. No integration into those workflows is implemented or authorized by this handoff. A separate comparison artifact is appropriate; replacing a production workflow is not.

This is the repository-shareable handoff. Private inventory records, exact holdings, comparison reports, credential values and archives are deliberately excluded. The complete private reconciliation report remains local.

## 1. Repository and recovery baseline

- Repository: https://github.com/toddaggie95/swc-personal-analytics
- Working branch: https://github.com/toddaggie95/swc-personal-analytics/tree/codex/initial-oauth-inventory
- Baseline source: https://github.com/toddaggie95/swc-personal-analytics/tree/898a2ac
- Local checkout: `C:\Users\bco95\OneDrive\Documents\ChatGPT\swc-personal-analytics`
- Last implementation commit: `898a2ac` (include SWC tags in standard station exports), successfully pushed during this conversation. Main was intentionally left unchanged. No PR was created in this conversation; no attached PR artifacts were found during handoff preparation.
- All source files are accessible at the baseline source link above. Private local handoff archives are not uploaded to Git.
- Working-tree status at handoff: `docs/architecture.md`, `docs/research.md`, `docs/security.md` are marked modified, but `git diff --numstat` shows no content changes (line-ending-only noise is suspected, not repaired). Untracked `foster-intake/`, `output/`, `tmp/` exist. Do not blanket-add, clean or delete them.
- Current source takes precedence over old explanatory documents and earlier conversation commands. Some architecture/research/OAuth text describes earlier phases.

### Runtime

TypeScript ESM on Node.js, PowerShell CLI; package declares Node >=18.18. Installed execution observed Node 24.14.0. Dependencies: `swcombine-sdk` pinned 3.5.0, `dotenv` ^18.0.3. Development: TypeScript ^7.0.2, tsx ^4.23.15, @types/node ^22.20.4. `package-lock.json` is the reproducible dependency record.

Setup: `npm ci`. Validation: `npm run check` (typecheck, offline tests, build). Latest verified suite has **32 passing tests**. Offline tests establish code behavior, not live SWC availability or field completeness.

Useful local tools if PATH is incomplete:
- Git: `C:\Users\bco95\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe`
- Python used for comparison: `C:\Users\bco95\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`

## 2. Implementation versus live proof

| Capability | Status/evidence |
| --- | --- |
| App registration/activation | User registered the application, initially pending; support ticket #399313 was created. User subsequently confirmed Active and client key/secret visible. |
| Manual installed-app OAuth | Successfully completed; user reported authorization saved and refresh token available. |
| Refresh persistence | Implemented and offline-tested, including rotating/preserved refresh tokens. Some later agent-side attempts failed; do not claim indefinite live refresh reliability. |
| Character access | Live success and user confirmation. Identity was verified with the user; the private character UID is omitted here. |
| Personal ships/stations | Live success, counts confirmed by user. |
| TFF/TJO full materials | Live success; historical snapshots and TJO reconciliation below. |
| TJO basic stations | Live success; all UIDs reconciled to manual CSV. User also supplied TFF station exports to another chat, but no verified TFF station total is established here. |
| Facility inventory | TFF pages succeeded before rate limiting. Name-filtered zero exports were WRONG. Bounded planet-ID probe proved nonzero TFF facility matches on Kashyyyk planet. Full corrected export completion was not independently verified here. |
| Dynamic location resolution | Implemented/tested; Kashyyyk planet publicly resolved to `8:896`, system UID `9:104` present in live records. Generic all-planet coverage not proven. |
| Scoped materials | Implemented/tested, not independently live-reconciled here. |
| Station production enrichment | Implemented/tested, automatic and resumable. User reports the full process is slow. No independently inspected complete enriched result or production-field reconciliation is established in this thread. |
| Station SWC tags | Basic raw tags reconciled; propagation into standard personal/faction exports implemented/tested at latest commit. New live tagged export not independently reviewed here. |
| Performance optimization | Investigated, not implemented. Fixed 6.5-second detail pauses remain. |
| CSV-compatible export, Google Sheets update | Not implemented. Existing production workflows untouched. |

## 3. OAuth and configuration

Registration/manage applications entry: https://www.swcombine.com/ws/ . Support: https://support.swcombine.com/ . A client secret was previously exposed; user believed it had been changed. The app requires explicit local acknowledgement of secret regeneration. Do not recover/reuse the old secret or paste current credentials into chat.

Credentials/configuration are in the local, Git-ignored project `.env`:

- `SWC_CLIENT_ID`: SWC Client Key (required; value deliberately omitted).
- `SWC_CLIENT_SECRET`: current regenerated Client Secret (required; value deliberately omitted).
- `SWC_APP_ACTIVATED=true`, `SWC_SECRET_REGENERATED=true`: local gates, not independent proof of SWC state.
- `SWC_OOB_RESULT_MODE=code-only` in the verified installation. Default template is `state-required`.
- `SWC_PKCE=disabled` in the verified installation; optional `s256` implemented/tested but not live proven here.
- `SWC_PRIVATE_DIR`: optional absolute path outside repository; otherwise default below.

The flow uses the SDK for OAuth and native fetch for data reads:
1. `npm run auth:start` creates random 32-byte base64url state and a 10-minute private pending session. Optional PKCE verifier is private.
2. User opens the generated URL, signs into SWC and approves scopes.
3. `npm run auth:finish` prompts for the code with hidden input. SWC's actual installed/OOB result was code-only, so blank returned state is allowed ONLY in the explicitly configured code-only mode. A provided state must match. Never instruct the user to copy state from the outgoing URL as though SWC returned it.
4. Pending session is consumed before exchange. An uncertain/failed exchange requires a fresh start. Codes are not persisted.
5. Token writes are atomic and awaited before success. SDK debug is disabled and retries set to zero for OAuth. Re-consent/refresh preserves the previous refresh token if the response omits one; expanded-grant refresh behavior still needs live validation.
6. `loadAuth` refreshes within five minutes of expiry; stores the resulting token before issuing data requests. A data 401 causes at most one refresh/retry. Only one process holds the private storage lock.

OAuth endpoints: `/ws/oauth2/auth/`, `/ws/oauth2/token/`; fixed redirect `urn:ietf:wg:oauth:2.0:oob`; offline access. There is no localhost callback server. Data reads send `Authorization: OAuth <token>` in a header, never a URL. No credential values should appear in logs, snapshots or commits.

Eight requested scopes:

```text
character_auth
character_read
personal_inv_overview
personal_inv_stations_read
personal_inv_ships_read
faction_inv_materials_read
faction_inv_stations_read
faction_inv_facilities_read
```

No write or broad all scopes. Granting a scope does not create in-game faction privileges. No extra scope was added for station detail reads.

### Storage and the environment mismatch

Default private root: `C:\Users\bco95\AppData\Local\SWC Personal Analytics` (`%LOCALAPPDATA%\SWC Personal Analytics`). Contains `tokens.json` (access/refresh tokens and expiry), `pending.json`, transient `operation.lock`, `raw`, `normalized`, `checkpoints`. Never upload token/pending files or the entire private root.

Several times the user's terminal saw a newly modified tokens.json while the agent saw an older modification time at the SAME path, even with elevated execution. User-run sync succeeded while agent refresh failed with invalid_grant. Cause remains unproven; do not assume the user saved incorrectly or repeatedly request reauthorization. Compare `npm run status` in the actual working terminal. It safely prints project path, private root and token timestamp, not values. Agent should mask SDK errors because they may include HTTP context.

## 4. API endpoints, pagination and rate limits

Base: `https://www.swcombine.com/ws/v2.0/`

| GET path | Use / proof |
| --- | --- |
| `character/` | Authenticated character + faction references; live success. |
| `inventory/{characterUid}/ships/owner` | Personally owned ships; live success. |
| `inventory/{characterUid}/stations/owner` | Personally owned stations; live empty result confirmed. |
| `inventory/{factionUid}/materials/owner` | TFF/TJO materials; live success. |
| `inventory/{factionUid}/stations/owner` | Faction station list; TJO fully reconciled. |
| `inventory/{factionUid}/facilities/owner` | Facility list; partial success and bounded ID-filter probe verified. |
| `inventory/stations/{stationUid}` | Per-station operations/detail; implemented, needs independent live field validation. |
| `galaxy/planets/{encodedName}/`, `galaxy/systems/{encodedName}/` | Resolve names to canonical UIDs; Kashyyyk planet lookup verified. |
| `/` | Public route metadata; read successfully during performance investigation. |

TFF = `The Faerytail Family`, UID `20:1174`. TJO = `The Faerytail Family: The Je\`daii Order`, UID `20:1838`. Normal syncs resolve faction UID from exact name in character.factions, rather than relying on these IDs. Station detail UIDs use prefix `5:`; facilities `4:`, material piles observed `16:`; planet `8:`, system `9:`. Some synthetic test fixtures use illustrative IDs and are not authoritative entity-type documentation.

Pagination: `start_index=1`, `item_count=200` max. Validate returned total/start/count, row count, unique UIDs and stable total. SWC may omit count; derive it from entity-array length. Reject empty intermediate pages, duplicate entities, changing totals and counts exceeding total. Pagination is not transactional.

JSON envelope: `swcapi`; lists contain `entities.attributes` and `entities.entity`. Individual entries can be wrapped as `{attributes:{href}, value:{...entity...}}`; unwrap before normalization. Exact response bytes are saved before parsing.

Location filter arrays are encoded as `filter_type[0]=planet|system`, `filter_value[0]=<UID>`, `filter_inclusion[0]=includes`. **Do not send location display names as filter values.** Live probe returned zero for `Kashyyyk`, but the same nonzero total for both `896` and `8:896`. Current code resolves names then sends full UID and validates location UIDs in results. Empty results alone cannot establish a correct filter.

### Rate limiting and unresolved performance issue

Official rate-limit page: https://www.swcombine.com/ws/developers/rate-limiting/ . It describes default 600 requests/hour per resource, keyed to public-facing IP, and headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-ResetTime`. User's probe reported remaining 598, 597, 596. Actual facility failure was HTTP 429, despite documentation describing HTTP 400.

Current implementation:
- Data requests: fixed GET methods, redirect rejection, 30-second timeout, bounded retries for 5xx.
- HTTP 429: honor the greater of Retry-After and numeric reset delay. Retry only if explicit delay <=60 seconds and attempts remain; otherwise stop with RateLimitError. Unknown reset stops immediately.
- Limited HTTP 400 detection recognizes only certain top-level error/message shapes; nested error-code formats remain a diagnostic risk.
- Batch stops remaining factions on RateLimitError. Completed detail requests are checkpointed.
- Fixed 6.5-second pauses between each station detail and between selected inventory pages. No adaptive scheduler or concurrency implemented. Rate headers are used on errors but not persisted in snapshot metadata or used proactively after successful requests.
- For illustration, 195 station details incur at least 21.1 minutes of deliberate sleeps, plus network/disk time. 1,029 incur about 111.5 minutes of sleeps. These are client pacing costs, not measured endpoint latency.
- Detail checkpoints are rewritten as a growing JSON object after each station, another potential I/O cost.

Last investigation found public `Inventory/Entities` GET query names only: `start_index`, `item_count`, `filter_type`, `filter_value`, `filter_inclusion`. Individual `Inventory/Entity` GET advertised no query parameters. No advertised `expand`, `include_details` or bulk-detail read was found. Batch property operations are writes, not a replacement read API. The web UI's backend and speed advantage were NOT inspected; do not claim it uses the same endpoint or scrape/bypass it.

Pending performance work: inspect remaining/reset headers on successful calls; design bounded/adaptive pacing consistent with actual limits, reduce redundant inventory downloads using server-side station filters, and consider explicit freshness-aware caching without silently presenting stale production as current. Ask SWC whether a supported bulk detail/expanded list exists if metadata remains inconclusive. No such optimization has been shipped.

## 5. Current user commands (authoritative at baseline)

Run in the project folder:

```powershell
npm run cli -- help
npm run status
npm run auth:start
npm run auth:finish
npm run sync:ships
npm run sync:stations
npm run sync:faction-materials
npm run sync:faction-materials:tff
npm run sync:faction-materials:tjo
npm run sync:faction-materials:tff -- --system "Kashyyyk"
npm run sync:faction-materials:tjo -- --planet "Kashyyyk"
npm run sync:faction-stations
npm run sync:faction-stations:tff
npm run sync:faction-stations:tjo -- --system "Kashyyyk"
npm run sync:faction-facilities -- --system "Kashyyyk"
npm run sync:faction-facilities:tff -- --planet "Kashyyyk"
npm run sync:faction-facilities:tjo -- --planet "Kashyyyk"
```

Suffix omitted = both factions, sequentially. Materials accept optional system/planet filters; without them collect all. Facilities REQUIRE exactly one location. Faction station options restrict DETAIL selection; initial station listing is still faction-wide. Personal ship/station commands have no location options; personal stations remain basic inventory only.

`sync:materials` aliases were deliberately removed. Separate `enrich:faction-stations:*` commands were introduced then removed: standard faction station sync now performs both stages automatically. Do not recommend obsolete commands.

Maintenance: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check`. Diagnostic: `node scripts/probe-facility-filter.mjs` (uses dist, fixed TFF/Kashyyyk planet, at most three one-row requests, not an export).

### Station combined export/resume design

`syncCompleteFactionStations` stages inventory in private checkpoints, then fetches details. Pending checkpoint key hashes faction + filter kind + lowercase name. Each station detail cache is keyed by source inventory run, owner and resolved location. On interruption, rerun the SAME command/scope to reuse prior details. On success, pending marker is removed; next invocation starts fresh. Only finished combined export enters normalized storage.

Validate detail UID, owner and requested location before accepting it. Refuse changed/unknown ownership/location instead of silently merging. Operations retain API actions, productionActions (EntityProductionAction subset), queueItems, tooledTo, cargo, underConstruction, tags and per-detail observedAt/sourceRun/rawDirectory. Queue entity references can identify produced designs; tooling alone cannot establish active production. Missing fields are null. Timer units remain API values, not guessed. There is no authoritative derived `isProducing` boolean.

Tags: exact SWC strings, no assistant-generated labels, casing/text preserved. Standard station top-level tags prefer detail tags; fallback to list tags when detail tags unavailable. `[]` means explicitly no tags; null means missing/unrecognized shape. Older cached details lacking a tags key are refetched. Null cached tags do not trigger repeated refresh. Personal station normalization includes list tags too.

Known resume caveats to review next: an indefinitely pending source can become stale; owner/location changes instruct refresh but there is no explicit restart flag; both-faction reruns can refresh an already completed first faction before reaching a pending second one. Source/raw metadata can span sessions. Output schemaVersion becomes 2 for enriched stations. These are not claims of instantaneous consistency.

## 6. Data extraction and reconciliations

A historical TJO station export and a TJO material export from the web UI were compared against completed API inventory snapshots by full SWC UID. Both UID sets matched exactly, with no missing or extra records. All compared quantities, types, names, ownership and containers matched. Populated shared location values agreed.

Material API responses supplied additional location information where CSV cells were blank. Some piles therefore fell into a system selection in the API but not a name-filtered CSV view. Do not erase the additional locations or alter existing sheet inclusion rules without separate verification. Raw material infotext matched. Material weight and volume were populated in the manual CSV but absent in the API listing; do not infer units or conversion factors.

For stations, raw notes, owner names, hull/shield/ionic values and maxima matched. Commander/pilot UIDs and populated names matched; CSV None corresponded to absent assignments. Access, protection, tags and construction flags matched after representation mapping. Production, tooling, workers, capacities and timers were absent from the basic inventory response and therefore not independently reconciled. Detail enrichment now exists but needs live field validation.

Exact counts, inventory identifiers, examples and per-field differences remain in the private local comparison reports identified below. They are not in this Git handoff. The next chat must not pretend it has read those reports remotely.

A manual-compatible projection is not implemented. Join by full UID; flatten references and coordinates; unwrap stat value/max; map access/protection carefully; preserve tag arrays canonically and format semicolon-delimited text only in a compatibility view. Null must not silently become idle, zero or absent ownership. Queue/action statuses, tooling, workers and timer units need live validation with capture-time differences accounted for. No Google Sheets writer or existing production workflow changes are included.

## 7. Artifact inventory

All paths below are relative to the repository unless stated. Each tracked file is available at `https://github.com/toddaggie95/swc-personal-analytics/blob/898a2ac/<path>` in the baseline repository tree.

| Files | Purpose |
| --- | --- |
| `src/config/index.ts` | Gates, eight scopes, API base, private root validation |
| `src/config/errors.ts` | Safe diagnostic messages without SDK/credential dumps |
| `src/auth/session.ts` | OOB state, optional PKCE, token exchange/refresh/persistence |
| `src/cli/index.ts` | Commands, routing, single-process lock, summaries |
| `src/cli/secret-input.ts` | Hidden authorization-code/state input |
| `src/swc/read-client.ts` | Fixed GET routes, filters, resolution, auth/retry/429 behavior |
| `src/swc/sync.ts` | Ownership selection, pagination, normalization, staged/final list output |
| `src/swc/enrich-stations.ts` | Automatic station details, checkpoints, resume, tags/operations |
| `src/models/station.ts` | Shared InventoryEntity schema, wrapped-entry handling, nullable coordinates, quantity/tags |
| `src/storage/files.ts` | Atomic private writes, JSON reads, lock |
| `src/storage/names.ts` | Filename-safe owner/type/scope naming |
| `src/storage/snapshots.ts` | Exact raw bodies, metadata/hash, completion marker |
| `tests/core.test.ts` | OAuth, pagination, failures, rate limits, naming, filtering, tags |
| `tests/enrichment.test.ts` | Operations preservation, resume, combined refresh behavior |
| `scripts/probe-facility-filter.mjs` | Bounded live filter diagnostic, no token output |
| `src/analytics/README.md` | Analytics placeholder, not production workflow integration |
| `package.json`, `package-lock.json` | Commands, dependencies and pinned install graph |
| `tsconfig.json`, `tsconfig.check.json` | Build/typecheck configuration |
| `.github/workflows/check.yml` | CI checks |
| `.env.example` | Blank credential template and safe defaults; NOT live config |
| `.gitignore`, `.gitattributes` | Ignore private/runtime data; line endings |
| `README.md`, `docs/command-cheat-sheet.md` | Current entry points and usage |
| `docs/oauth.md`, `docs/security.md`, `docs/architecture.md`, `docs/research.md` | Setup/security/design research; parts are historical |

Local-only comparison artifacts, not uploaded with this document:
- `data/web-api-comparison.md`, `.json`: reconciliation report and computed metrics. The Markdown report's schema section predates tags/enrichment; historical comparison remains valid, current schema must be read from source.
- `data/materials-comparison-differences.json`, `data/stations-comparison-differences.json`: per-field comparison differences.
- `tmp/swc_compare.py`: Python stdlib CSV/JSON comparison. IMPORTANT: assumes old raw directory `raw/<runId>`; update it to use summary.rawDirectory for new descriptive folders, and explicitly choose baseline/basic vs enriched snapshots. Do not run unchanged and assume it selected the latest export.
- `tmp/filter-probe.mjs`, `tmp/station-detail-probe.mjs`: investigative scripts, not supported user commands. First probe lacked safe exception handling and printed an invalid_grant diagnostic; do not reuse without review. The tracked facility probe masks errors.
- `foster-intake/`, `output/`: unrelated/unreviewed; not included in this handoff archive or changed for this task.

### Output naming and locations

New normalized inventory file: `<owner>__<inventory>__<scope>__<UTC-run-start>-<UUID>.json`, e.g. `tff__materials__system-kashyyyk__...json`, `tjo__stations__all__...json`. Owners personal/tff/tjo, scope all/system-name/planet-name. Names are sanitized; actual names/UIDs remain in JSON. New standard station exports include operations; older basic files are not retroactively changed. Intermediate historical enrichment files may have `stations-production` names.

Raw inventory folders follow the descriptive pattern; within them sequential `.body`/`.meta.json` pairs and `complete.json`. Diagnostics may retain run-ID-only names. Metadata records endpoint, query, retrieval time, HTTP status, content type, body file and SHA256; no auth headers. OAuth responses never become raw inventory snapshots. Summaries print exact `exportFile`/`rawDirectory`. Standard faction station runs put intermediate inventory in checkpoints, not normalized. Failed runs retain private partial data but must not be presented as completed final exports.

## 8. Commit history (implementation sequence)

| Commit | Change |
| --- | --- |
| c8d9d3c | Guarded OAuth/read-only station foundation |
| 98baf39 | Live pagination and safe OAuth diagnostics |
| 4e942ad | Personal ships; re-consent refresh-token preservation |
| fe7bf15 | Wrapped live inventory entities |
| 68f2fdd | TFF/TJO materials |
| 22dc8ff | Enriched locations; faction station list |
| b51fe32 | Faction facilities; operational detail plan |
| 3178882 | Rate cooldown and remaining-faction stop |
| 796a9f3 | Required facility location filter (name-filter bug existed here) |
| 755a845 | Bounded facility filter probe |
| c82b8ed | Resolve location names to UIDs; fixes false-zero name filter |
| 278af99 | Command cheat-sheet |
| c29cf2c / 8bcc8e4 | Faction-material naming; legacy aliases then removed |
| a80ecba | Optional material location filters |
| baf4a8e | Descriptive export naming |
| 1df779b | Separate station enrichment, later superseded |
| cf21257 | Single-command automatic station details/resume |
| 898a2ac | Exact SWC station tags in standard export |

All were committed/pushed to the feature branch during this conversation; no main merge was done.

## 9. Lessons and recommended continuation

1. Respect the immutable HAS/Production Overview/Production Changes boundary. Build comparisons separately.
2. Do not confuse passing tests with live API proof. Mocked name filters passed while SWC returned false zeros. Use bounded real probes and inspect echoed filters, locations and totals.
3. Locate the latest successful user-run combined station export and inspect a small producing/idle/tooled sample against a contemporaneous manual CSV. Preserve source paths/times. Validate queue design, statuses, workers and timer units before deriving active production.
4. Finish performance research before changing pacing. The 6.5-second delay is our choice, not a documented mandatory delay per call. However, deleting all delays or parallelizing 1,029 calls would not remove the hourly quota. No bulk-detail GET was advertised in the metadata checked.
5. Add safe remaining/reset metadata and adaptive scheduling; prioritize efficient scoped station queries. Avoid global rate-limit surprises and stale resume sources. Consider a restart control and better batch resume semantics.
6. Repair the comparison utility for descriptive raw paths/schema v2 and make it a tested maintained command if needed. Reconcile UID sets, fields and timestamps; retain private reports outside Git.
7. Flatten manual-compatible outputs only after verified field mappings. Never invent tags, quantities, idle state, locations or unit conversions.
8. No need to repeat OAuth app registration or broad scope research. Use the current terminal's local configuration; investigate path/version visibility before asking for another consent cycle.

Reference URLs:
- API route index: https://www.swcombine.com/ws/v2.0/
- API docs entry: https://www.swcombine.com/ws/v2.0/documentation/
- Entity detail docs: https://www.swcombine.com/ws/v2.0/documentation/inventory/entity_type/uid/
- Inventory list docs (web tool sometimes failed to open): https://www.swcombine.com/ws/v2.0/documentation/inventory/uid/entity_type/assign_type/
- OAuth flows: https://www.swcombine.com/ws/developers/oauth2/flows/
- OAuth token/refresh background: https://www.swcombine.com/ws/developers/oauth2/flows/web-server/
- Rate limits: https://www.swcombine.com/ws/developers/rate-limiting/

The handoff records findings from this conversation and the inspected repository, not a guarantee that SWC documentation or live holdings have remained unchanged since those observations.
