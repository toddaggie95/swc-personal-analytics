# Sublight experiments

## S-001 — BFF-1 Eberon (user observation)
- Origin (5,7), destination (5,10)
- Ship: BFF-1 Bulk Freighter, 20 MGLT (sheet)
- Pilot: Fraul Du`tan, Fighter/Freighter Piloting 3
- Initial displayed duration: 01:18:15 = 4695 seconds
- Proposed Chebyshev distance: max(0,3)=3 squares
- Implied rate if linear through origin: 1565 seconds per square (26m05s). **Not yet verified as a general rate**.
- Source: player-reported initial travel duration, 2026-10-14.

## Next tests
1. Same BFF-1 and pilot, different distance (prefer 1 square) to distinguish linear scaling and overhead.
2. KRS-1 Ore Hauler (40 MGLT; heavy freighter) and same pilot/distance to test speed scaling. At 3 squares, naive inverse-speed prediction 2347.5 sec (39m07-08s); prediction only.
3. RZ-1 A-wing (120 MGLT), same pilot/distance, to compare ship class.

For every test record origin, destination, exact initial ETA (h:m:s), pilot and any modifiers. Don't confuse countdown remainder with original duration. Record whether abort/restart impacts duration.

## S-002 through S-004 — controlled user measurements
All tests in Eberon, pilot Fighter/Freighter Piloting 3. Initial displayed durations (not remaining countdowns).

| ID | Ship | MGLT | Origin | Destination | Chebyshev D | Initial duration | Seconds | Seconds/grid |
|---|---|---:|---|---|---:|---|---:|---:|
| S-001 | BFF-1 | 20 | (5,7) | (5,10) | 3 | 01:18:15 | 4695 | 1565 |
| S-002 | BFF-1 | 20 | (5,7) | (5,8) | 1 | 00:26:05 | 1565 | 1565 |
| S-003 | RZ-1 A-wing | 120 | (5,7) | (5,10) | 3 | 00:13:00 | 780 | 260 |
| S-004 | RZ-1 A-wing | 120 | (5,7) | (5,8) | 1 | 00:04:20 | 260 | 260 |

**Findings:** Exact linearity in observed grid distance for each ship, across 1 and 3 squares; no detectable fixed startup overhead at displayed-second resolution. BFF-1 / A-wing per-square ratio = 1565/260 = 6.01923, slightly different from nominal MGLT ratio 6. Do not assume inverse-speed formula or rounding method. 31200/MGLT predicts 1560s and 260s, so it does not fit BFF-1. No KRS-1 test possible: pilot lacks permissions.

**Next best discriminating tests:** Diagonal route with Chebyshev distance 1 or 3; 2-square A-wing route to test per-leg rounding; optionally a different pilot skill or ship speed if accessible.

## S-005 and S-006 — A-wing validation
Pilot Fighter/Freighter Piloting 3; RZ-1 A-wing, 120 MGLT.

| ID | Origin | Destination | Chebyshev distance | Predicted | Observed | Error |
|---|---|---|---:|---|---|---:|
| S-005 | (5,7) | (6,8) | 1 diagonal | 00:04:20 | 00:04:20 | 0 s |
| S-006 | (5,7) | (5,9) | 2 axial | 00:08:40 | 00:08:40 | 0 s |

**Status:** H-001 Chebyshev distance is now supported by an exact diagonal-versus-axial match and exact distance proportionality across 1, 2, 3 squares for A-wing; BFF-1 matches 1 and 3 squares. Empirical formula for A-wing with this pilot `T_seconds = 260 * max(abs(dx),abs(dy))`; for BFF-1 `T_seconds = 1565 * max(abs(dx),abs(dy))`. Scope: these ship/pilot/route conditions; do not claim general game-wide proof or exact MGLT/skill formula.

## S-007 and S-008 — longer A-wing distance tests
Pilot Fighter/Freighter Piloting 3; RZ-1 A-wing, 120 MGLT.

| ID | Origin | Destination | Chebyshev distance | Predicted | Observed | Error |
|---|---|---|---:|---|---|---:|
| S-007 | (5,7) | (5,0) | 7 | 00:30:20 | 00:30:20 | 0 s |
| S-008 | (5,7) | (15,7) | 10 | 00:43:20 | 00:43:20 | 0 s |

A-wing observed distances 1, 2, 3, 7, 10 and a diagonal 1-square leg all agree with 260 seconds per Chebyshev square. No accumulated rounding difference through 10 squares. This does **not** distinguish exact underlying rate from a rate rounded per square before multiplication. Next discriminating variable: different MGLT or pilot skill, preferably same pilot.

## S-009/S-010 — Modular Conveyor (40 MGLT), same pilot
- User-reported initial times: 1 Chebyshev square = 13m02s = 782s; 3 squares = 39m06s = 2346s. Exact 3x proportionality. Specific endpoints not supplied; do not invent them.
- Across ships (pilot Fighter/Freighter Piloting 3): BFF-1 20 MGLT -> 1565s/square; Modular Conveyor 40 -> 782s/square; A-wing 120 -> 260s/square.
- New candidate: `seconds_per_square = floor(K/MGLT)` then `total_seconds = distance * seconds_per_square`. If K is integer, constraints from BFF: 31300 <= K < 31320; Conveyor: 31280 <= K < 31320; A-wing: 31200 <= K < 31320. Joint interval **31300 <= K < 31320**, or integer K=31300..31319. K=31300 fits all three. Not uniquely identified, and alternative game formulas remain possible. This candidate is a testable empirical fit, not verified implementation.
- Useful discriminating tests: additional MGLT rating, especially where floor(31300/MGLT) differs from alternatives; pilot-skill variation. Distances alone likely cannot resolve K if per-square truncation precedes multiplication.
