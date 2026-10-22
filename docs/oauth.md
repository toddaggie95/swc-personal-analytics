# Installed/OOB authorization runbook

## Initial setup prerequisites

1. SWC Personal Analytics must be activated by an ASIM (the original application is now Active).
2. SWC must regenerate/reset the original exposed app secret. Do not reuse it or send it to ChatGPT.
3. Confirm the Installed application's actual OOB result format and PKCE support with SWC documentation/support.
   Official documentation access during implementation returned Anubis; no bypass was attempted.

Follow-up: the original application completed live code-only OOB authorization and an authenticated
character/station collection. See research.md. Keep the safeguards below for new installations.

## Configure after activation

Copy `.env.example` to `.env`, enter the app client ID and **new** secret locally, then set
`SWC_APP_ACTIVATED=true` and `SWC_SECRET_REGENERATED=true`. These are operator acknowledgements,
not an API check that SWC has activated the app. Do not change them before those steps are complete.

The redirect URI remains `urn:ietf:wg:oauth:2.0:oob`. The SDK constructs the authorization-code request
with `access_type=offline`. Never substitute the SDK example's localhost redirect for this Installed app.

## State and PKCE: compatibility is not assumed

Every start creates 256 bits of random state, stored privately with a ten-minute local expiry and client ID.
The default `SWC_OOB_RESULT_MODE=state-required` requires the state **returned by SWC**, entered separately
from the displayed code. A mismatch is always rejected before exchange. Do not copy state from the outgoing
authorization URL: that would not validate the return path.

If SWC confirms/displays only a bare authorization code for Installed/OOB applications, set
`SWC_OOB_RESULT_MODE=code-only` and start a new session. Enter the code and leave returned state blank.
This explicitly accepts manual code transfer without returned-state CSRF verification; it does not pretend
the server returned state. Use only the result of the authorization you just initiated in your own browser.
If a state is supplied even in this mode, it must match. If the result format differs, stop and adapt the
parser from official information rather than guessing or pasting a whole URL into the code prompt.

The SDK supports S256 challenge/verifier parameters, but its tests mock the token server. That is not proof
SWC enforces PKCE in Installed/OOB flows. `SWC_PKCE=disabled` is the documented compatibility default.
Set `SWC_PKCE=s256` only once SWC compatibility is confirmed; the generated verifier is then persisted
privately and submitted in the code exchange. Do not silently downgrade if authorization fails.

## First live proof

1. Run `npm run auth:start`. Open the printed URL manually and review the eight read-only scopes.
2. Authorize in your own browser. SWC credentials belong only on SWC's login page.
3. Within ten minutes run `npm run auth:finish` in an interactive terminal. Paste the displayed code at
   the hidden prompt, then returned state (or blank in confirmed code-only mode). No code is stored.
4. Tokens are written atomically before success is reported. The pending session is consumed before
   exchange, so a failed or uncertain exchange requires a new start. A missing refresh token is reported
   explicitly; it does not constitute proof of offline access. SWC may issue refresh tokens only on first
   consent; consult SWC's grant management instructions rather than repeatedly authorizing blindly.
5. Run `npm run sync:stations`. This calls `GET /character/` (the SDK's `character.me()` equivalent),
   extracts the character UID, then reads owned stations in pages of at most 200, starting at 1.
6. Confirm the safe count summary and matching `raw/<run>/complete.json`. Inspect raw data locally if
   needed. The completion marker plus raw bodies proves the collection path for that run; offline tests do not.

The CLI refreshes near-expiry tokens before data calls, persists refresh results, and retries a 401 after
at most one refresh. SDK token merging retains a previous refresh token if the server omits it on refresh.
An API error or malformed response is retained privately and stops completion. SDK exceptions are never
dumped to terminal because they may carry sensitive HTTP context.

The SDK OAuth transport has no configured request timeout in this release. If exchange/refresh hangs,
cancel the process and inspect the local session state; follow stale-lock recovery in security.md. Do not
replay a possibly consumed code. Token revocation endpoint is researched but no revoke command is exposed
in this initial read-only CLI; use SWC's app/grant management when revocation is necessary.

## Adding personally owned ships

Run `npm run auth:start` and `npm run auth:finish` in the same terminal to grant the added
`personal_inv_ships_read` scope. With verified code-only OOB mode, enter the new code at the hidden prompt
and leave state blank. Re-consent retains an existing local refresh token if SWC omits a new one; the
expanded permissions of a later refresh grant still require live verification.

Then run `npm run sync:ships`. This reads `/inventory/{characterUid}/ships/owner`, never faction or
commander/pilot assignments. Empty or unavailable coordinates remain null. No ship detail/write endpoints
are exposed. Raw responses remain private; normalized snapshots keep names, types, owner-query provenance
and available coordinates.

## Faction-owned materials

Faction materials use `faction_inv_materials_read`. Run the authorization steps again,
then `npm run sync:faction-materials` to collect both The Faerytail Family and
The Faerytail Family: The Je`daii Order. This requests owner-assigned materials only; no faction ship,
credit, member, write or broad all scopes are requested. A grant does not create in-game privileges.
Missing faction references, denied access and malformed/partial responses fail without a completion marker;
they must never be interpreted as zero holdings. The CLI still attempts the other requested faction and
exits nonzero if either collection fails. A successful response may be limited by SWC's visibility rules.

Faction station collection adds `faction_inv_stations_read`. After re-consent, run
`npm run sync:faction-stations` to try both factions independently, or append `:tff` / `:tjo` to that
script name. This exports station inventory and available locations, not full production-queue detail.

## Faction-owned facilities

Facility collection requests `faction_inv_facilities_read`. Run `npm run auth:start`, approve
in SWC, then `npm run auth:finish` in the same terminal. Keep codes and credentials local.
Run `npm run sync:faction-facilities -- --system "Kashyyyk"` for both TFF and TJO, or
`npm run sync:faction-facilities:tjo -- --planet "Kashyyyk"` / `npm run sync:faction-facilities:tff -- --planet "Kashyyyk"` for one faction.
This reads owner-assigned facilities in pages of 200 and saves raw and normalized snapshots.
The completion summary reports ownedFacilities. Existing grants need expanded consent;
offline tests do not establish live facility access.

## Operational detail enrichment plan

Use the documented GET /inventory/stations/{uid} and /inventory/facilities/{uid} detail
endpoints, not write/action endpoints. Documentation:
https://www.swcombine.com/ws/v2.0/documentation/inventory/entity_type/uid/

1. Sample known producing, idle, constructing and tooled stations from the web CSV.
2. Inspect raw detail actions, queueitems and cargo. The installed SDK describes action
   status, delay.total/remaining, workers, producing entities and quantity, plus total/remaining
   cargo capacities. These are candidates until verified against our live entities.
3. Validate current tooling separately from RetoolingAction (a change in progress).
   Preserve unknown/missing values; do not equate a missing field with idle or zero.
4. Compare by UID with the web CSV, accounting for elapsed time. Verify timer units and
   distinguish active workers from queue staffing and total capacity from remaining capacity.
5. Once validated, add bounded, resumable detail enrichment with observation timestamps,
   rate-limit handling and explicit per-entity failures. Do not mark partial detail collection
   complete or silently overwrite earlier known fields with missing values.

The facility list feature does not yet fetch these individual details.

### Location-limited facility collection

Facility commands require exactly one of `--system "Name"` or `--planet "Name"` after npm's `--`.
Names are resolved through the galaxy endpoint, then the returned UID is passed as the server-side filter on every page. System includes all planets in that
system; planet limits collection to that planet. Matching is checked against returned location UIDs; missing or different locations stop the run rather than silently broadening it.
The summary's locationFilter identifies the scope: ownedFacilities is a location count, not a faction total.
Pages are spaced by 6.5 seconds, and a rate-limit cooldown stops remaining factions. Smaller collections
still share SWC's rate allowance and cannot bypass an existing cooldown. A bounded live planet probe confirmed names return a false zero while numeric IDs and full UIDs match.
Planet Kashyyyk (8:896) returned 8,165 TFF facilities at probe time. Full collection still requires a
successful completed run. Older name-filtered zero snapshots are unverified and must not be used as holdings totals.
