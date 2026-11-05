# Full station-state parity audit — proposed implementation

## Objective
Establish correct classification from SWC API inventory, station detail, and existing enrichment before attempting performance optimization. Systems: Kashyyyk, Tholatin, Daluuj. Include both TJO and TFF, every station type (shipyards, factories, depots, etc.), not just working shipyards. Preserve manual CSV as production authority; no spreadsheet writes or merges.

## Ground-truth controls
- Kashyyyk TFF `5:56984`: queued/idle, queue status `queued`, no `actions`, `tooledto` present (run 42086929708).
- Daluuj TJO `5:37746`: retooling, `RetoolingAction` and `EntityProductionAction`, all queue statuses `queued`, no `tooledto` (run 42082296310).
- Daluuj TJO `5:19046`, `5:19047`: producing, `EntityProductionAction`, a queue item `producing`, `tooledto` present (run 42082296310).

## Method
1. Capture complete system-scoped station inventory for TJO and TFF with pagination; record station UIDs and type breakdowns. Compare normalized inventory and, where accessible, raw inventory working filter. Do not infer working state from normalized export alone.
2. Fetch station details for every unique station UID with existing checkpoint/resume and API pacing; do not restart completed work after timeouts. Preserve a sanitized structured summary per station and collect raw payload only in private artifacts, never logs.
3. Parse with current `stationOperations` enrichment. Classify using explicit, tested rules: producing queue item; retooling action; queued-only idle; idle without queue; unknown/conflict. Keep nonproduction action types and non-shipyard activity separately classified rather than forcing production labels.
4. Report each station with UID, faction, system, type, raw inventory working flag if available, action types, queue status counts, tooling presence, predicted state, anomalies, detail-read success, and relevant provenance. Aggregate confusion matrices and totals by system/faction/type.
5. Compare with same-time manual web CSV exports where available. Flag stale snapshots and timestamp mismatches rather than claiming discrepancies.
6. Reconcile anomalous stations interactively; add sanitized fixtures and deterministic regression tests. Only then explore collection performance (working filters, conditional detail reads, event API, cached checkpoint deltas).

## Risks / constraints
- Approximate detail pacing previously observed ~6.5 seconds; hundreds of stations will exceed a 15-minute job. Use chunked, resumable jobs and separate artifact checkpoints. Do not run a large scan through the one-station diagnostic.
- `working=1` includes retooling; `EntityProductionAction` may coexist with retooling; `tooledto` may be present while idle.
- Confirm exact interpretation of `EntityProductionAction.value.status`, `RetoolingAction.value.status`, and missing-material state before relying on them.
- Never expose OAuth tokens or private station payloads in public logs.
- No production HAS, Overview, Changes, or Sheet modifications in audit phase.

## Exit criteria
- Every station in all three systems either classified with evidence or explicitly flagged unknown.
- All detail read failures accounted for; totals reconcile against inventory; known controls match.
- No unresolved model contradictions hidden in aggregates.
- Regression fixtures and audit report retained; performance design based on measured call counts, latency, and correctness.
