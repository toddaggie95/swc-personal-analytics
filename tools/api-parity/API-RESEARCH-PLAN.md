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
