# Hyperspace and Squad Movement — Working Hypotheses

Source: Player's multi-year SWC travel observations, 2026-10-14. Both are hypotheses, not independently verified rules.

## H-002: Squad travels at slowest member's speed

**Classification:** High-confidence player-observed hypothesis.

When ships of different speeds are squadded together, the entire squad travels at the speed of its slowest ship, for both sublight and hyperspace movement. Need to establish whether this means lowest nominal speed, lowest effective speed after pilot/other modifiers, or longest independently computed ETA. Test mixed-speed squads with the same origin/destination and compare with solo trips. Record squad leader and individual pilots if relevant.

## H-003: Hyperspace uses Chebyshev system-coordinate distance

**Classification:** High-confidence player-observed hypothesis.

For systems with galactic map coordinates `(x1,y1)` and `(x2,y2)`, proposed distance is `D = max(abs(x2-x1), abs(y2-y1))` in system-grid units, analogous to the in-system distance hypothesis H-001. Distinguish galactic *system* coordinates from local coordinates *within* a system. Validate with observed hyperdrive trip durations at different distances, hyper ratings, and pilot skills. Account for possible additional modifiers, minimums, and integer-second rounding.

## Model separation

Treat distance, individual ship effective speed, and squad bottleneck as distinct stages. Do not assume formulas are verified or that hyperdrive ratings map linearly to travel time until tested.
