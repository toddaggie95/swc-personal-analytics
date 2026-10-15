# SWC Movement rules — source review (2026-10-14)

Source: user-provided 12-page PDF, `__Movement - Star Wars Combine__.pdf`, SWC Movement rules, displayed last updated Year 27 Day 284. Record this as a source-derived review, not as independent confirmation of the current live game implementation.

## Confirmed in the supplied rules

- Hyperspace requires spooling; spooling is a percentage of the time to travel one galactic square, reduced by relevant piloting skill. **Time spent in hyperspace is reduced by the spool timer** (PDF p2). Do not add the full spool timer to a full, unreduced hyperspace time.
- Spool table: Heavy Freighters 30%, hyper 4 = 9m baseline; Fighters 25%, hyper 8 = 3m45s baseline (p2). Precise piloting reduction is unspecified here.
- Hyperspace exit stasis optional, up to 24h (p2).
- Aborting hyper leads to a 60m cooldown, reduced 5% per relevant piloting skill level (p3). This is an abort cooldown, **not** evidence of the spooling skill formula.
- Capital ships and larger: turning over 45 degrees adds 1/8 of one-square travel time per stationary 45-degree increment (pp3-4).
- Sublight computer avoids suns/black holes when navigating to other destinations (p4), so actual route can deviate from coordinate-only shortest path.
- Celestial gravity well radius = round(planet size / 6); jumping from a gravity well risks damage (pp4-5).
- Orbit↔atmosphere and ground↔atmosphere transitions each take 1h (pp6-7).
- Atmosphere ship max speed = 10 × sublight MGLT in km/h (p7); ground ship speed capped at 200 km/h (p8). These formulas are **not** a space/sublight seconds-per-square formula.
- Page 8 explicitly says the maximum speed of a squadron/party equals its slowest member, but note this is under **Ground Movement Calculations**. It supports the general principle, but doesn't explicitly confirm its application to sublight/hyperspace.
- Travel planner can chain legs and choose routes; ships have skippable inter-segment delays from 2 to 120 minutes depending on elapsed time since last plan update (pp9-10).

## Still unverified

- Exact sublight time per system square, skill effects, integer-second rounding.
- Exact hyperspace base time per galactic square and whether galactic Chebyshev distance is used.
- Hyperlane mechanics are not described in this supplied Movement PDF.
- Whether mixed-ship squads use slowest nominal or effective speed in sublight and hyper.

## Experiment logging

Record start/end coordinates, movement layer, ship type/class, listed and cockpit speed, pilot skill, initial displayed ETA to second, spool phase versus hyper phase, squad members, gravity well/obstacle conditions, and travel planner delay separately. Preserve raw screenshots privately; do not commit private identifiers/inventories to public GitHub.
