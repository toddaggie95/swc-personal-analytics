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

## First live Kashyyyk batch — 2026-11-05
- Run: https://github.com/toddaggie95/swc-personal-analytics/actions/runs/42089414411 (success). Artifact: `station-audit-Kashyyyk-tjo-0-42089414411`, GitHub artifact ID `13444457512`.
- Target: Kashyyyk, TJO, UID-sorted offset 0, limit 25. Inventory: 195 unique TJO stations; processed 25/25; zero detail-read errors; next offset 25.
- Classification: 8 `queued-idle` (all Shipyard I, queue status `queued`, no actions); 17 `unknown-no-operation-data` (13 Depot Station I and 4 Shipyard I).
- All four unknown Shipyard I records had non-null tooling; all 13 unknown Depot Station I records had no tooling. Missing `actions` and `queueitems` are not assumed to imply idle: investigate with independent working-state evidence and other action cases.
- No producing or retooling samples in this batch. These 17 records are missing API fields, NOT confirmed CSV/API mismatches or failed reads.
- The 25-detail workflow completed within approximately 50 seconds elapsed from start, with artifact upload successful; do not extrapolate unbounded performance without more samples.
- Next: TJO Kashyyyk offset 25, limit 50, then subsequent offsets until all 195 unique TJO stations captured. Repeat for TFF; then Tholatin and Daluuj. Treat snapshots as non-transactional. Checkpoint persistence across separate GitHub runs is not yet implemented.

## Second live Kashyyyk batch — 2026-11-05
- Run: https://github.com/toddaggie95/swc-personal-analytics/actions/runs/42089880214 (success). Artifact `station-audit-Kashyyyk-tjo-25-42089880214` (ID `13444847182`).
- Target Kashyyyk TJO, offset 25, limit 50: 50/50 details read, zero errors, nextOffset 75; 195 unique TJO stations.
- Classifications: 22 producing (16 Shipyard I, 6 Shipyard IV); 21 queued-idle (17 Shipyard I, 4 Shipyard III); 7 unknown-no-operation-data (3 Shipyard I, 4 Shipyard III). All 7 unknown shipyards have tooling but neither actions nor queueitems.
- Producing examples: `5:53035` EntityProductionAction with queue statuses `producing,queued,queued`; `5:53036` same action with `producing,queued,queued,queued`. Mixed queue statuses within a producing station are expected, not contradictory.
- Cumulative TJO Kashyyyk first 75: 22 producing, 29 queued-idle, 24 unknown-no-operation-data; zero detail-read errors. No retooling cases yet in these 75.
- Next offset 75, limit 50; after that offset 125, limit 50, then offset 175, limit 20, assuming inventory UID order remains stable. Note offset batching can skip or duplicate UIDs if inventory changes between runs; compare saved UIDs at aggregation.

## Web UI validation — Kashyyyk station 5:52955 (2026-11-05)
- User inspected station `5:52955` directly in SWC web interface: **Idle**, tooled to **TIE/in Interceptor**, and production queue appears **empty**.
- API audit had `actions` absent, `queueitems` absent, and `tooledto` present. This is a confirmed example that missing action/queue fields can represent **idle** rather than an API read failure, and that tooling does not mean active production.
- Working rule: operational status should derive from explicit active action; queue describes queued/producing items and should be retained independently. Before globally treating absent action fields as idle, verify a second case (prefer a depot and/or shipyard of a different class), and continue flagging inconsistent action/queue combinations.
- Current reports retain `unknown-no-operation-data` for historical batches pending cross-check; do not silently rewrite prior observed evidence.

## Second SWC web control and classifier update — 2026-11-05
- User independently verified Kashyyyk TJO Depot Station I `5:52582`: idle, no production, empty queue, no tooling, blank info field. This corroborates `5:52955` (idle Shipyard III, tooled to TIE/in Interceptor, empty queue).
- Research collector updated in commit `a71a2d2`: when no active action is reported, classify `idle-queued`, `idle-tooled`, or `idle-untooled`; an explicit EntityProductionAction is producing; RetoolingAction is retooling. A queue item marked producing without a corresponding production action is a conflict requiring investigation. Mixed production/retooling actions are also a conflict. Unknown action types remain under review.
- Preserve action presence and queue presence separately for auditing; queue status and tooling do not independently establish production. This is a hypothesis supported by two SWC UI controls; test against more station types and action combinations before using in authoritative production writes.
- Prior run artifacts are historical and retain their original classifications; no production sheet writes.

## Idle assignment taxonomy — user decision, 2026-11-05
- Operational status and production assignment are independent. Queue presence is NOT an idle assignment classifier: if a matching order exists, start it; otherwise create the required order. Retain queue details only for execution and consistency checks.
- `idle-assigned-tooled`: no active production/retooling action and valid `tooledto` ship; this is the authoritative production assignment regardless of InfoText. If InfoText names a different ship, flag for review without changing tooling authority.
- `idle-proposed-infotext`: no tooling, InfoText unambiguously identifies a valid ship; proposal only, requires Sims confirmation before first production. Do not infer from arbitrary text or start production automatically.
- `idle-unassigned`: no tooling and InfoText empty, invalid, or not a recognized ship; needs assignment from Sims.
- For unreadable/missing InfoText or unverified ship parsing, retain `idle-assignment-unresolved` rather than incorrectly labeling as unassigned. Need inspect API field/schema and compare against web exports, then add robust ship-name matching using the canonical Ships tab or existing ship catalog. Preserve raw info field safely in private audit, publish only sanitized summary.
- `5:52955` web-verified idle/tooled; `5:52582` web-verified idle/untooled/blank InfoText. Existing collector's `idle-queued`/ `idle-untooled` are temporary and should be superseded only after InfoText extraction is validated.

## InfoText-aware audit collector implementation — 2026-11-05
- Commit `eb75005`: the research collector no longer uses queue presence to subdivide idle stations. It probes `info`, `infotext`, `infoText`, `information`, `description` on station detail/attributes and inventory/attributes, reporting field presence and blank/nonblank status without publishing raw free-form text.
- Idle with tooling => `idle-assigned-tooled`; idle without tooling and confirmed blank InfoText => `idle-unassigned`; absent/unrecognized InfoText or nonblank InfoText not yet matched to canonical ship => `idle-assignment-unresolved` with anomaly reason. `idle-proposed-infotext` is reserved until validated ship catalog matching is implemented.
- Validation required: run a bounded audit and check actual API InfoText field shape, then integrate a canonical ship-name source before promoting nonblank InfoText to proposed. Historical 75-station results do not contain InfoText and cannot be retrospectively split without reread. No production writes.

## Focused correctness pass — 2026-11-05
- Latest Kashyyyk TJO 0–49 audit run 42097079414: 50/50 details, zero fetch errors, 24 idle assigned/tooled, 12 idle unassigned, 13 producing, one unresolved InfoText candidate `5:52839`. These are observed batch totals, not full-system coverage.
- Corrected mixed-action precedence in the research classifier: a retooling station with both `EntityProductionAction` and `RetoolingAction`, but without a producing queue entry, is **retooling**, not a conflict. Daluuj TJO `5:37746` is the previously verified control. Both a retooling action and a producing queue item together remain a conflict. Bare production action without a producing queue is anomalous only when not retooling.
- Pause broad system audits; finish Kashyyyk classification first, including canonical Ships catalog matching for nonblank InfoText, and targeted controls for mixed actions. Do not infer intended ship from arbitrary InfoText, change live production, or interpret queue presence as assignment.
- Following correctness validation, profile read-client pacing, per-detail latency, filtered inventory calls, repeated inventory fetching per bounded audit, and checkpoint reuse across GitHub runs. Compare safe optimized implementation against same UIDs and classification before broad rollout.

## Simplified idle assignment policy — user-confirmed 2026-11-05
- Kashyyyk TJO depot `5:52839` is web-confirmed idle with no known assignment; its InfoText `384 TI` is not a reliable ship identifier.
- **Final simplified rule:** idle station with tooling present => `idle-assigned-tooled`; idle station with no tooling => `idle-unassigned`. InfoText is informational only, and does not create a proposed assignment or an unresolved classification.
- Retain `unknown` for failed reads and `conflict` for inconsistent operational signals. Do not build a free-text ship parser or require Ships tab lookup for idle classification.
- Earlier research notes and prior audit artifacts describe superseded exploratory InfoText logic; do not reinterpret historical reports as using this policy.
- The current audit script reflects this policy. Live re-audit and automated regression coverage remain to be performed; production publishers remain unchanged.
