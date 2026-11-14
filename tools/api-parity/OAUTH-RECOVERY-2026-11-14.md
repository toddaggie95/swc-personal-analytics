# OAuth recovery and enriched station parity

## Evidence and diagnosis

GitHub connector inspection of run 42199875151 confirms refresh was rejected in
the planning process at 2026-11-06 10:05 UTC. No station detail worker ran. The EXIT
trap then reported a successful secret write despite no successful refresh. This
rewrote the rejected snapshot; it did not restore authentication.

The previous run 42190245065 completed at 08:50 UTC. Its plan found 1,346 TFF and
1,029 TJO stations. A successful secret write does not prove that a refresh took
place: the old trap wrote even unchanged credentials. Existing logs do not reveal
the OAuth error code or establish which grant/client credential was rejected.
Do not claim that rotation or concurrency caused this particular rejection.

The pinned SDK 3.5.0 sends a URL-encoded refresh grant including client ID and
client secret, preserves an existing refresh token if the response omits one,
and has no cross-process persistence transaction. The pinned application awaits
an atomic local write, but previously relied on a workflow-exit trap for remote
durability. Separate workflow concurrency groups allowed shared credentials to
be used simultaneously. Those are confirmed failure opportunities, independent
of the unresolved server-side rejection.

## Repair

- Overlay the hardened `src/auth` modules on the audited collector in renewable
  coordinator workflows. Await local and GitHub environment-secret persistence
  inside refresh, before returning an access token for further API requests.
- Require a hosted secret writer before rotation. Share an in-flight refresh
  inside each provider and latch failures so a process never repeatedly attempts
  a rejected or uncertain refresh. Only fixed allowlisted diagnostics are logged.
- Record successful persistence privately. EXIT fallback compares against that
  receipt or the initial snapshot and never rewrites unchanged rejected tokens.
  Persistence failures propagate as workflow failures.
- Share `swc-api-shadow-oauth` across the 11 credential workflows on this branch;
  disable automatic live runs on pushes. Workers use access-token-only copies,
  including the previous single-runner timing exception.
- Honor manual 1/4/all batch selection in the enriched workflow; avoid secondary
  missing-artifact validation errors when planning fails.

GitHub environment secrets are read when the job starts, unlike repository secrets
which are read when queued. Keep the durable token in the `swc-api-shadow`
environment. See [secret timing](https://docs.github.com/en/actions/reference/security/secrets)
and [shared concurrency groups](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

This branch cannot serialize old workflow versions on other branches or local
OAuth sessions. Do not run those against this grant during recovery. A runner
crash between server refresh and remote save is still an unavoidable transaction
gap with GitHub secrets as the store. A secret-writer outage after refresh stops
the run; a fallback retries saving the locally retained result, never refreshing
again. Raw tokens are never uploaded as artifacts. If both saves fail and runner
cleanup occurs, manual credential recovery may still be necessary.

## Validation completed

- The pinned collector with the new auth overlay passed TypeScript checks and all
  40 existing offline tests, including omitted-refresh-token preservation.
- New tests cover concurrent refresh, rejected-refresh suppression, durable-save
  failure, missing writer, and extraction fallbacks. Shell tests verify unchanged
  and already-saved credentials are skipped and writer failures propagate.
- All 11 credential workflow YAML files parse and their shell steps pass syntax
  checks. Batch planning/manifest tests cover all 2,375 UIDs in 48 unique batches.
- Downloaded the retained 50-station artifact from 42190245065. Applying the same
  extractor now used by the collector yields names/locations/coordinates 50/50,
  tooling objects 10/50 and tooling values 10/10. No IDs or source records are
  committed. `ENRICHMENT-VALIDATION-2026-11-14.json` contains counts only.

This is offline extraction validation of retained objects, not a new live API
capture. Run 42199875151 produced no enriched capture.

## Recovery and next live validation

After `npm run auth:start` and `npm run auth:finish`, replace the complete
`SWC_OAUTH_TOKENS_JSON` environment secret with the new `tokens.json`. Default
Windows location: `%LOCALAPPDATA%\SWC Personal Analytics\tokens.json`; an explicit
`SWC_PRIVATE_DIR` overrides it. Keep the matching client ID/secret. Do not paste
tokens into chat or rerun the old failed workflow revision.

After the new secret is confirmed saved, run the repaired one-request OAuth
probe once on this branch. If it fails, stop and diagnose its fixed category;
do not repeatedly dispatch or request another consent without evidence. A probe
using an unexpired token proves access, not unattended refresh. Later verify one
expiry-triggered refresh plus durable save, then a second run using saved state.

Next dispatch `swc-api-enriched-sample.yml` with `max_batches=1`. Require zero
read errors/anomalies, exact manifest membership, all 50 coordinates, and a
normalized tooling value for each non-null tooling object. Compare that sample
against matching TFF CSV rows before full collection.

## Full 2,375-station CSV parity plan

1. Read current TFF/TJO station CSV exports without changing Drive or Sheets.
   Record source file hashes/timestamps, API run/commit, and schema headers.
2. Normalize numeric station IDs and `5:` UIDs to one identity format. Reject blank
   IDs, duplicates, cross-faction duplicates, and unrecognized coordinate shapes.
3. Compare the bounded 50 rows for name, location references and coordinate levels,
   and exact `tooled-to` versus `tooledToValue`. Preserve unknown versus blank and
   zero versus missing. Document representation mappings using real CSV headers;
   do not compare display strings to objects or guess equivalent fields.
4. After the sample passes, manually select all batches (`max_batches=0`). The
   previous baseline is 27 TFF + 21 TJO batches, 48 total; recheck live membership
   and explicitly report inventory drift rather than forcing an outdated count.
   Keep at most four access-only workers and existing quota/expiry guards. Never
   authorize worker refresh to work around expiry; resume through a coordinator.
5. Require exact UID coverage with no duplicate/missing/extra results and zero
   read errors. Compare enriched fields per UID and faction, reporting field-level
   mismatches, unknowns, and capture-time differences. Actions/queue classifications
   remain API-only where the CSV has no equivalent evidence.
6. Replace the legacy comparator's hard-coded run ID and obsolete omitted-field
   limitations, add explicit sample/full modes and source provenance, and test it
   against duplicate IDs, zero coordinates, missing tooling, and stale snapshots.
   Keep identity-level reports private; publish only aggregate counts.

No production Sheet edits are required or authorized by this validation plan.
