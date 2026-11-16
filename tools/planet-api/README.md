# Read-only planetary capability pilot

This generic acquisition tool contains no economic hypotheses or secret parameters.
Planning research lives in the private optimizer repository. All live data and
field evidence are encrypted before artifact upload; logs contain fixed outcomes.

One exact planet and the authenticated TFF faction are resolved before inventory.
The pilot reads one filtered page each of facilities/cities, up to three facility
details, two distinct facility types, one city detail from available references,
the planet's public and inventory views, and one facility type catalog page.
It does not claim complete all-owner coverage or a complete planetary capture.

Private planet inventory detail is opt-in (`include_planet_inventory`), default
false. The expanded grant was verified on 2026-11-15, but a planet detail and a
faction planet-list request still returned 401 while city/facility reads worked.
Do not treat those resource-specific failures as proof that the refresh grant is
invalid, repeatedly retry them, or require reauthorization without new evidence.
Any requested 401 still stops the normal pilot; it is not ignored globally.

At most 18 GET requests, serial 6.5-second pacing, no automatic data retries,
240-second request-start deadline, 30-second per-request timeout. HTTP 401/429
stops the run; 403/404 record a capability gap without retrying that resource.
The established durable OAuth session and cross-workflow concurrency lock are
reused. No scopes are added, no sheet authorization is present, no writes to SWC
or production accepted state occur. OAuth rotation may persist the current grant.

Transport shapes are grounded in pinned swcombine-sdk 3.5.0 resources and existing
filtered inventory support. Official endpoint documentation was inaccessible on
2026-11-15; live evidence must establish actual permissions and field availability.
Candidate SDK scopes include faction_inv_cities_read and faction_inv_planets_read,
but no reauthorization is justified until current access is tested.

Offline: `node --test tools/planet-api/*.test.mjs` (Node 24).
Live: the dedicated workflow on the reviewed branch. Inspect the encrypted report
before expanding page counts, faction coverage or enrichment. Income observation
time is not treated as generation time; missing data is never silently zero.

## One consolidated authorization

The latest session supports `SWC_OAUTH_READ_PROFILE=planning` or `all-read` during
`npm run auth:start`. With no profile, existing scope behavior is unchanged.
`planning` retains production inventory permissions and adds city/planet reads,
personal facilities/materials and character skill/privilege/event evidence.
`all-read` explicitly requests the published character/faction read permissions,
messages, every personal/faction inventory category and tag reads. It includes
private messages, finances, Force information and combat reports; choose it only
when that breadth is intended. No `_all` umbrella or mutation scope is requested.

Both use the normal `auth:finish` hidden-input flow. Run from an existing configured
collector installation after updating `src/auth/session.ts` and adding its sibling
`read-scopes.ts`. The pinned source alone does not contain these new profiles.
This change does not start authorization, refresh tokens, or change existing grants.
OAuth scope does not override the character's actual faction privileges, expand
API field availability, reveal unpublished game constants, or timestamp old payouts.
After authorization, install the complete new tokens JSON in the existing hosted
environment before launching hosted jobs; avoid overlapping authorization with runs.
