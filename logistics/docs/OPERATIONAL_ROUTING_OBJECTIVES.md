# Operational routing objectives

Player requirement 2026-10-15: SWC Travel Planner can be configured for unattended ('fire-and-forget') movement. Manual multi-hop staging may save in-game travel time but can require the player to be online at intermediate hyper exit to issue next command. Therefore do not optimize solely theoretical travel duration.

## Distinct metrics
- **Travel duration:** elapsed movement time, including hyperspace, spool-up effects, sublight, ascent/descent and any configured planner delays.
- **Intervention count:** number of player actions, especially mandatory mid-route interventions.
- **Availability-constrained completion:** actual delivery completion accounting for when the player is next available to act, including waiting at intermediate stop.
- **Reliability / unattended execution:** whether route can complete without further user input; evaluate separately from speed.

## Decision policy (proposed)
Default to unattended Travel Planner routing for overnight or otherwise unattended production logistics. Compare manual staging only when expected end-to-end completion advantage remains meaningful after availability waits, or user will already be online at required transition. Do not invent a universal 30-minute threshold; make user preference configurable.

## Example (illustrative, not measured)
Planner 4h, manual 3h30m but requires intervention at intermediate exit. If player unavailable for 8h, manual route may finish later despite 30m theoretical saving.

## Uncertainties
Verify which SWC Travel Planner legs and intermediate jumps can truly auto-execute, whether multi-waypoint trips are supported, and whether an intermediate exit must require manual action. Do not assume planner cannot automate the directional staging idea until tested.
