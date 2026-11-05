# API read-path investigation (read-only)

## Goal
Find a fresh, complete production-status read path that avoids one detail GET per shipyard. Keep the existing four-CSV pipeline authoritative until verified.

## Measured baseline (2026-11-05)
- Kashyyyk TJO inventory: 195 stations (173 shipyards, 22 depots), ~1–2 seconds.
- 15 shipyard detail GETs: 63 seconds; 5 with production actions, 10 with absent actions field; tooling 15/15, queue 12/15.
- Extrapolated 173 details: ~727 seconds (~12.1 minutes) for Kashyyyk TJO alone.
- TFF Kashyyyk: 81 stations, none named Shipyard; station-detail requests can be skipped for TFF production if the scope is explicitly TJO-owned shipyards.

## Documentation evidence and caveats
- SWC Y27 D312 release note mentions **batch update Inventory/Entities/Property**: this is a write operation, not evidence of a bulk read.
  https://www.swcombine.com/community/simnews/index.php?display=2&postID=23583
- SWC Y27 D257 notes a change to **InventoryEntity actions output**, especially entities with multiple actions. Do not interpret missing actions as idle without web CSV parity.
  https://www.swcombine.com/community/simnews/index.php?display=2&postID=23571
- The collector currently reads `inventory/{factionUid}/stations/owner` (paginated, scoped) and `inventory/stations/{stationUid}` (one entity at a time). No verified bulk production-status read endpoint yet.

## Research order (avoid premature optimization)
1. Read official SWC WS 2.0 Inventory and Actions resource docs for collection-level entity/action endpoints, query filters, summary endpoints, and response fields.
2. Test only documented, read-only endpoints with the existing OAuth session; do not guess endpoint paths, bypass rate limits, or use update APIs.
3. Compare any candidate bulk response against a known Kashyyyk TJO 15-shipyard sample and recent four web CSV exports, keyed by UID. Require exact running/idle/tooling/quantity parity.
4. If no bulk read exists, test whether inventory query parameters can expose action/status data in a single page, and whether conditional HTTP requests (ETag/Last-Modified) are supported. Only cache mutable production fields if freshness is provable.
5. Only after a sound read path exists, implement a scoped prototype and run all-system parity without Google Sheet writes.

## Hard acceptance gates
- Station ownership, UID, coordinates, tooling, running status, production quantity, and materials match web CSVs.
- Missing API action fields remain **unknown** unless authoritative evidence supports treating them as idle.
- No cached production status silently masquerades as fresh status.
- 20-system refresh duration is measured, bounded, and compatible with daily automation.
- PR remains unmerged; no live sheet changes.

## Initial documentation audit (2026-11-05)
- Official SWC Y27 D257 announcement explicitly says InventoryEntity action output changed, including multiple actions: https://www.swcombine.com/community/simnews/index.php?display=2&postID=23571
- Y27 D312 batch Inventory/Entities/Property operation is **update**, not bulk read: https://www.swcombine.com/community/simnews/index.php?display=2&postID=23583
- Public WS developer resource reference pages were not retrievable from the research environment; no bulk read endpoint is verified. Do not fabricate paths.
- Existing `stationOperations` assumes `detail.actions.action` is an array. The new action output requires shape testing with saved live snapshots, including zero, one, and multiple actions, before changing status interpretation.
- Production overview's current `operation-coverage.mjs` treats missing production actions as unknown; preserve this fail-closed behavior until paired CSV verification.

### High-value next controlled experiment
Using a **single existing authorized station detail GET**, capture only the structural shape (array/object/absent) of `actions`, `actions.action`, `queueitems`, and `tooledto`, plus whether multiple production actions occur. Compare to web CSV by UID. Never print private cargo or station names. Then evaluate whether a documented inventory-level action/status field exists in the same response. Do not probe undocumented URLs.

## Nine-shipyard action-shape result (run 42060877856)
- Completed successfully on 2026-11-05. Kashyyyk TJO inventory: 195 total, 173 shipyards.
- Nine detail reads: 52 seconds, extrapolated 173 details ~1000 seconds (16.7 minutes). The estimate is sample-based and differs from the 15-station benchmark.
- Raw action shape: 3 `actions.action` arrays; 6 entirely absent `actions` fields; no nested singleton objects observed in this sample.
- Parser extracted three running actions. Tooling present 9/9; queue present 8/9.
- This sample does **not** establish that omitted actions means idle. Compare by UID with same-time web exports before any status interpretation changes.
- Next: inspect SWC official read resource documentation and collector's station inventory response fields; avoid unnecessary per-station detail requests until a better read route is verified.

## Raw inventory collection inspection (run 42063259495)
- Read-only run succeeded; one filtered Kashyyyk TJO inventory page contained all 195 stations.
- Raw entity keys: commander, entitytype, hull, images, infotext, ionic, location, name, opento, owner, protected, shield, tags, type, uid, underconstruction, wrecked.
- No raw action, production, tooling, queue, or change-indicator keys observed on the inspected record. Thus normalization is not the cause of the missing production data on that record. Inspect field presence across every record before claiming none exist anywhere.
- Next research hypothesis: the web export may be server-side enriched or use an internal endpoint not exposed by the documented API. Find a documented collection-level read of production actions before committing to per-station polling.

## Official capability discovery: major finding (2026-11-05)
SWC publishes an official, public, **unauthenticated GET resource-discovery endpoint** at `https://www.swcombine.com/ws/v2.0/`. Its developer reference describes structured route names, URLs, methods, authentication requirements, permissions, and query parameters. This is the answer to the earlier question "can we ask the API what it supports?"
- Resource catalog: https://www.swcombine.com/ws/v2.0/developers/index.php
- Machine-readable root: https://www.swcombine.com/ws/v2.0/
- Root documentation: https://www.swcombine.com/ws/v2.0/documentation/
- Inventory collection documentation: https://www.swcombine.com/ws/v2.0/documentation/inventory/uid/entity_type/assign_type/
- Individual entity documentation: https://www.swcombine.com/ws/v2.0/documentation/inventory/entity_type/uid/

### Priority hypothesis: documented `working` filter
Inventory collection supports `filter_type=working`, with boolean `filter_value=1` or `0`, and `filter_inclusion=includes`; documentation says working applies to stations, but does not define it as production specifically. It may mean any activity, including retooling. **Do not equate working=1 with production started until validated by UID.**
- Use same authenticated read-only inventory collection with Kashyyyk system filter AND working=1.
- Compare UID sets with a same-time web export and 15 known detail responses, separately for shipyard classes and depots.
- Also test working=0 if permitted, and check whether union of both equals unfiltered inventory.
- Check whether production action state and tooling can be inferred from other documented filters. The documented list includes working but not explicit production or tooling filters.
- Inventory collection GET and POST are both documented; POST is a **read** for long filter sets, distinct from the separate batch property-update POST. No reason to prefer POST for a short filter set.
- If working reliably identifies running production, detail GETs may be needed only for a small subset or for tooling changes. But no production type/quantity/tooling fields appear in collection records observed so far.

### Capability audit backlog
1. Save a sanitized route catalog from unauthenticated root (no credentials); compare live root with documentation for newly added operations.
2. Audit Events collection for production-start/finish notifications and whether events cover faction-owned stations and contain reliable UIDs.
3. Audit Inventory entity detail action shapes, queue, tooling, and timing fields; test against web CSV.
4. Audit other read endpoints for production-related bulk views, but avoid guessing unsupported paths.
5. Inspect official SWC SDK repositories for extra endpoint usage and supported filters; they may lag current server.
6. Check rate-limit response headers and documentation; no rate-limit evasion or unbounded parallelism.
7. Document gaps and send a precise API feature question to SWC maintainers if necessary.

### Hard safety boundaries
Read-only, bounded, documented calls; no production sheet writes; no cookies/session replay; no state-changing POST/PUT/DELETE; serialize OAuth experiments; no sensitive raw responses in public logs.

## Working=1 live result and event resource documentation (2026-11-05)
- Run https://github.com/toddaggie95/swc-personal-analytics/actions/runs/42068321664 succeeded.
- Kashyyyk TJO unfiltered 195, documented working=1 matched **107**, returned 107, and **0** returned UIDs outside the unfiltered list.
- Working=1 is NOT yet confirmed to mean active ship production. Compare with station details and web CSV, and test working=0 complement.
- Official events GET: https://www.swcombine.com/ws/v2.0/documentation/events/event_mode/event_type/
  - Modes: personal, faction, inventory, combat; optional event_type filter is allowed ONLY for personal/faction.
  - start_time Unix timestamp supports incremental retrieval; item_count 1–1000; faction_id optionally chooses faction.
  - Event output has uid, type, timestamp, and HTML text. Production-event coverage and ownership scope **not yet verified**. Event streams may be a change-detection aid, but not authoritative state without evidence.
- Public resource catalog enumerates only Inventory collection and single Inventory entity GET; Inventory/Entities/Property POST is a batch **write**.
- Next experiment code was committed at e20566ad44eca14445f92f2a813d755989770dbd: working=0 complement, working/idle by type, and full 195-record raw field coverage. Workflow trigger was blocked by tool safety and **was not launched**; do not imply results.
