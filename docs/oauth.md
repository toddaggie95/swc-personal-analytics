# Installed/OOB authorization runbook

## Current blockers

1. SWC Personal Analytics is Pending Activation by an ASIM.
2. SWC must regenerate/reset the original exposed app secret. Do not reuse it or send it to ChatGPT.
3. Confirm the Installed application's actual OOB result format and PKCE support with SWC documentation/support.
   Official documentation access during implementation returned Anubis; no bypass was attempted.

No live authorization, token exchange or private API access has been attempted during implementation.

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

1. Run `npm run auth:start`. Open the printed URL manually and review the four read-only scopes.
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
