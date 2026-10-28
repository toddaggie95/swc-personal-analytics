# Production Overview — guarded implementation plan

Status: **development only**. No production spreadsheet writes or existing workflow changes are authorized by this document.

## Approved behavior

- **READY NOW**: an idle, assigned production order is completely supportable by unreserved material aboard any station in its **own audited hub**. A one-off station's local pool is only that station.
- **AFTER MOVEMENT**: not ready within its hub, but completely supportable by remaining unreserved accessible **orbital station** material in the same system.
- **BLOCKED**: neither condition holds; show per-material shortfall against remaining unreserved system inventory.
- **UNASSIGNED**: no production design/quantity. **BUILDING**: already started; do not reserve another order's bill.
- **Priority**: protect explicitly prioritized capital ships (Behemoth and Endurance) first; maximize additional starts within remaining priority tiers. Tie-break deterministically, preferring fewer transfers.
- A hub's central depot is part of the hub pool. Avoid interpreting hub READY NOW as “every material is already aboard the individual shipyard.”
- Count materials by unique pile ID and station container UID. No ground facilities, planets, inaccessible third-party stations, or cross-system transfers in readiness pools.

## Source-of-truth boundaries

- TFF/TJO exports: physical station and material identity, position, quantity, and ownership.
- Audited layout manifest: station-to-hub/one-off membership.
- Live system tabs: assigned design, build quantity, Started status.
- Ships tab: design material bill of materials (BOM). Validate design names and quantities.
- Production Overview: **output only**; never use old Overview totals as input.

## Implementation sequence and safety gates

1. **Read-only integration**: retrieve system-tab production orders and Ships BOM; map orders to station UID by system and coordinates. Fail on ambiguous or missing mappings, unknown ship types, invalid quantities, or invalid material bills. Do not silently assume 48 for unknown designs.
2. **Inventory reconciliation**: build station-level orbital inventory from deduplicated piles. Verify station sums equal existing audited destination HAS, and preserve exact pile IDs in the allocation trace.
3. **Allocation**: reserve feasible prioritized hub starts first; then solve system-wide additional starts without reuse. The current pure-function allocator is an **initial greedy prototype**, not yet an optimizer that guarantees maximum additional starts. Implement exact/validated optimization or clearly label a lower-bound result before publishing.
4. **Readiness assertions**: per-order bill coverage; station/system/ownership match; no pile double-count; inventory conservation; no overlapping destination ownership; totals reconcile (building + ready now + transfer + blocked + unassigned = audited shipyards).
5. **Regression**: run all existing production-sync tests plus readiness tests. Compare existing audited HAS ledger with the pre-change baseline on identical export fixtures. Fail closed on any HAS drift.
6. **Shadow mode**: generate a readiness JSON artifact from actual exports and live orders without writing Sheets. Review exceptions and compare to current Overview; never assume current Overview totals are authoritative.
7. **Publish gate**: only after passing shadow audit, introduce an explicit `enable_overview_writes` workflow input defaulting to **false**. Write only designated Overview cells, verify post-write values, and do not modify system-tab HAS or production assignments.
8. **Rollout**: merge only after CI and shadow validation. Enable Overview writes separately after review.

## Operational caveats

- A successful CI test is not evidence of successful live-sheet integration.
- Production order Started status comes from the live sheet unless a validated SWC export field explicitly supersedes it.
- Allocation reservations are recomputed from scratch for each export batch; never persisted as inventory consumption.
- Exact optimization can be computationally expensive. Use a bounded solver with a verified feasible allocation; never present a greedy feasible count as a proven maximum.
- On failure, preserve the last successfully published Overview and upload diagnostics.
