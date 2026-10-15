# Planetary movement model — initial evidence and routing design

Date: 2026-10-15. Scope: SWC logistics route planner. Preserve distinction between player observations, game rules, and untested inference.

## Player-confirmed observations
- Planetary ascent comprises two legs of 1 hour each, 2 hours total, regardless of ship type for tested A-wing, BFF-1 Bulk Freighter, and KRS-1 Ore Hauler.
- Planetary descent also comprises two legs of 1 hour each, 2 hours total, for these ships.
- On-planet journeys between nearby cities can be faster by traveling through the origin city to its boundary, crossing intervening wilderness/surface terrain to the next city's boundary, then traveling through that city to the destination facility or onward boundary.
- The user describes the intercity surface area as 'wilderness or whatever the game calls it'; do not assume an official terrain-mode name.

## Initial routing framework (design, not validated game mechanics)
Represent origin/destination facility nodes, local-city coordinate nodes, city edge/boundary transitions, wilderness/intercity surface segments, and orbit/planetary transitions. Build candidate routes:
1. Surface: facility -> within-city -> city boundary -> intercity terrain -> next city boundary -> within-city -> facility, with repeated city/terrain segments if needed.
2. Orbital: facility -> ascent (2h) -> orbital/in-system travel (ship-specific) -> descent (2h) -> facility. Baseline ascent+descent 4h when both required; additional segments may apply.
Optimize elapsed time subject to vehicle access, travel permission, loading/cargo capacity, coordinates, and game restrictions.

## Unknowns / measurements to collect
- Exact time function for movement within a city, including diagonal/axis distance, terrain and vehicle modifiers.
- City edge coordinate system, size, boundary-crossing behavior and transition costs.
- Exact wilderness movement mechanics, map naming, terrain effects, movement speed, vehicle type.
- Whether cargo, crew, or ship state changes any surface movement times.
- Whether orbital travel is viable for arbitrary city-to-city transfers and how ship position and ground/space transitions work.
- Any additional loading, docking, facility entry/exit time.

Do not claim that all SWC ships universally have identical ascent/descent times based solely on three tested types.

## Player-confirmed common coordinate distance rule (2026-10-15)
- Within-city travel uses the same Chebyshev distance metric as in-system sublight and inter-system hyperspace: `D=max(abs(x2-x1),abs(y2-y1))`.
- Coordinate spaces differ: city-local coordinates for within-city movement, system coordinates for sublight, galactic system coordinates for hyperspace.
- Evidence classification: player-confirmed city rule; sublight metric separately supported by exact diagonal and axial measurements; hyperspace metric remains a player hypothesis pending independent test.
- Distance calculation is shared, but duration, speed, modifiers, and boundary-crossing overhead are mode-specific and not interchangeable.
