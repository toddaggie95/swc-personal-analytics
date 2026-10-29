# Station detail performance audit — 2026-10-28

Source examined: `codex/handoff-2026-10-28` at `898a2ac`.
**Scope: research only. This file does not change any running workflow.**

## Verified facts versus tests

- Previous chat reports live OAuth and TFF/TJO basic inventory success; full station production-field reconciliation **not proven** in provided Git source. The 32 tests described by the handoff are mocked/offline, not independently executed in this audit.
- `src/swc/enrich-stations.ts` unconditionally calls `await wait(6500)` **before every uncached station detail**, including the first station. At 1,029 stations this adds 111.5 minutes of deliberate waiting, independent of network time.
- `src/swc/read-client.ts` parses limit/reset headers only after 429. It does not capture remaining/reset information on successful calls or proactively schedule requests.
- `enrich-stations.ts` rewrites the full and growing checkpoint JSON after every new detail: possible quadratic total serialization I/O.
- `syncCompleteFactionStations` stores a source inventory in a pending checkpoint without a freshness cap. Reruns can combine new detail observations with an old list. The location filter restricts enrichment candidates but `factionStations` always downloads the full faction list.
- The public Inventory/Entity GET documentation advertises **no query parameters** for expanded/bulk details. No supported expanded station detail list was established in the checked documentation. SWC's rate-limit documentation describes a default 600 requests/hour **per resource, per public IP**; do not treat it as one global or immutable endpoint guarantee.

## Proposed safe optimization (NOT shipped)

1. Add request metadata instrumentation to the isolated API client: for every successful response capture `X-RateLimit-Limit`, `Remaining`, `Reset`, `ResetTime`, endpoint category, duration, and observation timestamps **without credentials or inventory data in logs**. Retain server header values as evidence rather than claiming an inferred quota.
2. Introduce a single serial, bounded, proactively throttled scheduler using actual remaining/reset data. Respect Retry-After and reset, including 400/429 limit responses. Do not implement unconstrained parallel fetching or automatic long waits. Ask operator permission for long running sessions.
3. Persist per-UID detail checkpoints atomically (rather than rewriting a full JSON map) and validate cache UID, owner, location and observation age before reuse. Add explicit `--restart` and a max-age/freshness policy.
4. Separate inventory-list `observedAt` and each detail `observedAt`. Fail completeness/freshness gates if observed snapshots span an unacceptable interval; never quietly label a resumed old snapshot current.
5. Test one small scope against a near-contemporaneous manual CSV (running, idle, tooled stations) before any full-faction collection. Compare raw actions, queue, tooling, quantities, workers and timers; do not derive production from tooling.
6. Only after real measured headers and documented query support consider smaller detail intervals or server-side filtering. Inventory/Entity details have no advertised `expand`/bulk GET in inspected public documentation. Contact SWC support for an official bulk solution rather than scraping web UI or bypassing limits.
7. Emit stand-alone comparison artifacts. Never alter HAS, Production Overview, Production Changes, accepted export batch, Drive import folder, or their workflows.

## Code-level constraints to preserve

Maintain strict UID/owner/location validation, raw response retention, rotating OAuth token durability, serial process lock, bounded retry, and no implicit approval of stale details. Public docs: https://www.swcombine.com/ws/developers/rate-limiting/ and https://www.swcombine.com/ws/v2.0/documentation/inventory/entity_type/uid/ .
