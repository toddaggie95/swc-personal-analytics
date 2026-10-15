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
