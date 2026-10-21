# Source review and confidence

## Live compatibility follow-up (2026-10-21 UTC)

Installed/OOB authorization displayed a bare code, so the local configuration uses the documented
code-only mode. Authorization returned a refresh token, and authenticated character and owner-assigned
station collection completed with raw snapshots stored outside the repository. No credentials or live
response contents are committed. Refresh-token issuance does not by itself prove a later refresh grant.

Live inventory responses can omit `entities.attributes.count`. Pagination now uses the returned array
length when count is absent, matching the reviewed SDK behavior, while still validating total, start,
explicit counts and duplicate UIDs. Regression tests cover empty and multiple pages without count.

CLI diagnostics now distinguish missing/inaccessible session files and token-save failures using fixed
messages, without printing underlying exception messages, request details, credentials or private paths.

The sections below record the original pre-activation research; their pending items describe that time.

Reviewed 2026-09-25 UTC (2026-09-24 America/Chicago). npm reported `swcombine-sdk` **3.5.0**;
that version is pinned and locked. Upstream main at review was
`0969ed9f850dedb4861b49d3dba3ceee04903dae`.

Primary source paths reviewed in [jonmarkgo/swcombine-sdk-nodejs](https://github.com/jonmarkgo/swcombine-sdk-nodejs):

| Source | Finding used in implementation |
| --- | --- |
| `src/auth/OAuthClient.ts` | Auth `/ws/oauth2/auth/`, token `/ws/oauth2/token/`, revoke `/ws/oauth2/revoke`; offline access; optional S256; URL-encoded code and refresh grants |
| `src/auth/TokenManager.ts` | Five-minute refresh buffer; preserve old refresh token if replacement omits it; storage save is fire-and-forget |
| `src/auth/scopes.ts` | Exact four requested scopes exist; broad helper scope bundles deliberately avoided |
| `src/resources/CharacterResource.ts` | `me()` is `GET /character/`, **not** `/character/me` |
| `src/resources/InventoryResource.ts` | `GET /inventory/{uid}/{entityType}/{assignType}`; 1-based `start_index`, max `item_count=200`; entities array and attributes total/start/count |
| `src/resources/BaseResource.ts`, `src/pagination/Page.ts` | Pagination advances start by returned count; SDK defaults missing metadata and can stop on an empty intermediate page |
| `src/http/HttpClient.ts` | API v2.0 base; `Authorization: OAuth ...`; unwraps swcapi envelope; 401 refresh guard; 429 and certain 400 rate limits; Retry-After seconds/date; exponential retry for 5xx |
| `src/types/index.ts`, published inventory detail declarations | UID/type references; optional location nodes; coordinates under `attributes`; missing coordinates while moving |
| `tests/unit/oauth-pkce.test.ts` | Verifier/challenge and parameter wiring tested against mocks, not evidence of live SWC enforcement |

The installed ESM implementation and public type declarations were also inspected, including SWCombine's
public API. It offers no supported response-byte hook or transport injection. Rather than monkey-patch
private SDK fields or capture global Axios traffic (which could capture tokens), this application uses the
SDK for OAuth, scope constants, token merging and refresh, and a tiny fixed-endpoint fetch transport for
character/station reads. This transport preserves bodies before unwrapping and validates pagination more
strictly than the SDK. It never exposes arbitrary request paths to users or a network server.

Verified future endpoint shapes in SDK: entity details `/inventory/{entityType}/{uid}`, overview
`/inventory/{uid}`, and a separate location resource. Faction UID inventories, other entity types,
station tooling/production, facility/mining, galaxy/hyperlane and canonical Types API work are deferred.
No claims are made that station listing supplies all detail fields or that current scopes permit every
future endpoint.

## Official documentation boundary

Attempted authoritative sources:

- [Web Services hub](https://www.swcombine.com/ws/index.php)
- [Authentication](https://www.swcombine.com/ws/developers/authentication/)
- [Permissions](https://www.swcombine.com/ws/developers/permissions/)
- [Inventory list](https://www.swcombine.com/ws/v2.0/documentation/inventory/uid/entity_type/assign_type/)

The hub returned Anubis to a direct HTTP request; other pages were inaccessible or returned Anubis/access
denied through web tools. No challenge was solved and no Darkness UI was accessed. Official semantics
could therefore not be independently confirmed. SDK-based behavior above is provisional where official
confirmation is required; official documentation takes precedence if it differs.

The OOB redirect comes from the user's registered Installed application. Generic SDK localhost examples
are not evidence to change it. Returned-state behavior for this OOB app and server PKCE enforcement remain
unverified. See oauth.md for fail-closed defaults and the explicit code-only compatibility choice.
