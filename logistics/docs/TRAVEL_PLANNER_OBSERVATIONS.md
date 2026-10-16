# Travel Planner observations

## TP-001 — A-wing Eberon to Tholatin (2026-10-15)
Source: user-reported Travel Planner step timings. Ship RZ-1 A-wing (120 MGLT, class 8 hyperdrive); character Fighter/Freighter Piloting 3 (previously established).

- Origin Eberon galactic (224,93), local (5,7), occupied by planet.
- Destination Tholatin galactic (238,88), requested local (8,13).
- Step 1: planner moves out of planet's vicinity via sublight (5,7) -> (3,9): **00:08:40 = 520 s**. Chebyshev local distance 2; exact match with measured A-wing 260s/grid.
- Step 2: Travel Delay **00:01:56 = 116 s**.
- Step 3: Spooling **00:02:59 = 179 s**.
- Step 4: Hyper **02:44:51 = 9891 s**.
- Sum displayed steps **02:58:26 = 10706 s**, not necessarily complete door-to-door arrival if further post-hyper movement exists.
- Galactic Chebyshev distance `max(abs(238-224),abs(88-93))=14`.
- Hyper leg averaged over galactic distance: 9891/14=706.5s per galactic grid square; **not an unmodified base rate**.
- Earlier cockpit observations list Eberon–Tholatin hyperlane 330 navigation data blocks and 8% displayed travel speed increase. **Unverified** whether this journey actually uses it, whether percentage is rounded, and how applied relative to spool and pilot modifiers.

## Outstanding questions
- Is the 2:44:51 hyperspace leg already hyperlane-adjusted? Is the planner using the Eberon–Tholatin lane?
- Does the planner show additional sublight travel after arrival to destination local (8,13)? Record arrival local position and post-hyper steps.
- How does planner delay vary? Is 1:56 randomly chosen?
- Is the spool duration reduced by pilot skill and deducted from total hyperspace time per Movement rules?
- Capture exact step timing on a no-lane or 1-grid jump to isolate baseline.

## TP-001 follow-up — arrived in Tholatin (2026-10-15)
- Actual hyperspace arrival local position: **(0,10)**, western/left boundary of Tholatin.
- Requested final local destination: (8,13).
- After arrival, Travel Planner imposed an **approximately 15-minute** travel delay (user's estimate, not exact seconds). User reports delay grows with more journey legs; preserve as player observation/hypothesis, not verified quantitative rule.
- User clicked **Continue Now** to bypass delay. Post-hyper sublight ETA from (0,10) to (8,13) = **00:34:40 = 2080 seconds**.
- Chebyshev local distance `max(8,3)=8`; 8*260=2080 seconds, exact match with A-wing observed rate.
- Eberon (224,93) lies west of Tholatin (238,88); western boundary arrival at x=0 is **consistent with** approach-direction entry hypothesis H-004/H-006, but one case does not establish causality. Arrival y=10 remains unexplained.
- Distinguish first Travel Delay 1m56s before hyper from second approximately 15m delay after hyper. The user bypassed second delay; do not add full 15m to actual elapsed time.
- Nominal planned route step sum through hyper 02:58:26; plus post-hyper sublight 00:34:40 = **03:33:06** excluding any second arrival delay. If second delay were fully waited, approximate 03:48:06; not observed actual elapsed.

## TP-002 — Mammoth Tholatin to Eberon (2026-10-15; in progress)
- Pilot: Fraul Du`tan (default for all observations unless user specifies otherwise).
- Mammoth departed Tholatin local (8,8); Travel Planner first moved to **(4,4)** (user corrected initial typo '(4,3)').
- Reported initial sublight duration approximately **01:44:18**, versus 4-square Chebyshev distance at 1565 s/square predicting **01:44:20** (2-second approximate/display discrepancy).
- Reported hyperspace spooling **~00:28:47** (uncertain by a few seconds).
- Reported hyperspace leg **~21:54:54**.
- Sum of reported three legs **~24:07:59**, excluding Travel Planner delays and any Eberon arrival sublight.
- Hypothesis for Eberon entry: (19,10), east boundary, opposite observed Tholatin (0,10). **Not yet measured**.
- All durations approximate, and source coordinate (4,4) is user-confirmed correction.
