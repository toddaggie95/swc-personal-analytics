# Hyperspace arrival and adjacent-system movement hypotheses

Recorded 2026-10-15. Evidence categories must be preserved.

## H-004 — Arrival at system boundary
- **Player working hypothesis, not experimentally verified:** Upon hyperspace arrival at another named system, the ship appears at a system boundary and then must travel in-system by sublight to its destination.
- Test: capture arrival local coordinates and destination local coordinates after a named-system hyperjump; record ETA and movement mode for onward trip. Check whether arrival edge depends on approach direction, destination selection, and system geometry.

## H-005 — Sublight crossing between adjacent galactic systems
- **Secondhand report from experienced SWC players, unverified:** Ships may be able to travel from the edge of one system to an adjacent system via sublight across the boundary, avoiding hyperspace.
- Test: identify adjacent systems and record navigation options at an edge, any crossing timer, arrival position, and whether sublight mode is available. Do not assume permitted or safe.

## Routing implications (hypothetical)
- Model galactic systems as regions with internal positions, entry/exit boundary nodes, and local sublight costs.
- Compare hyperjump + local sublight against direct sublight boundary crossing where game permits.
- Preserve separate timing for spool-up, hyperspace, boundary transition, and local sublight. Do not double count spool-up.
- Origin system position and destination local position may materially affect fastest route.

## Evidence caveats
- No direct measurement for H-004/H-005 yet.
- Deep Space (224,92) adjacent to Eberon (224,93) is shown in player screenshot; not proof of traversability by sublight or of named-system boundary behavior.

## H-006 — Directional hyperspace arrival via adjacent staging coordinate (2026-10-15)
- **Player recollection / speculative hypothesis, not confirmed:** To choose a favorable boundary of a target system at galactic `(x,y)`, first hyperjump to adjacent galactic coordinate `(x-1,y)` and then hyperjump east into `(x,y)`; the approach may cause arrival at the **left/west** system boundary. Analogous approach from east/north/south may choose other edges.
- Motivation: target local system position near `(0,15)`; if western entry is achievable, potentially avoid substantial in-system sublight travel.
- This is DISTINCT from H-005 (physically crossing adjacent systems by sublight). It proposes two hyperspace jumps with an intermediate staging coordinate, which may be deep space.
- Unknown: whether arrival edge follows approach vector; exact arrival local position; whether adjacent deep space is valid as staging; spool/exit penalties per leg; whether direction or destination system position controls arrival; safety/feasibility.
- Experiment: record direct-jump arrival position, then from adjacent staging coordinate approach target and record entry position, with ship/pilot and route modifiers held constant when feasible. Compare total elapsed time including two spools and destination sublight. Avoid costly detours until basic navigation rules are verified.

## Planned reverse-direction test (2026-10-15)
User plans Mammoth flight from Tholatin local (3,13) to (8,8) for materials, then hyperspace to Eberon (224,93) from Tholatin (238,88). Hypothesis: return arrives Eberon local **(19,10)**, opposing observed Tholatin west-edge exit **(0,10)** from outbound A-wing. Proposed four midpoint boundary exits on 0..19 local grid: from west (0,10); from east (19,10); from north (10,0); from south (10,19). Only (0,10) is empirically observed. Note galactic displacement for return dx=-14, dy=+5, so east-west dominant; exact diagonal handling unverified. User will report measured exit and planner stages. Fraul Du`tan is default pilot unless explicitly noted.
