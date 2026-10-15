# Hyperlane rules reference

Source: user-provided SWC Hyperlanes rules PDF (3 pages, last updated Year 26 Day 89).

Public hyperlanes are bidirectional, automatically used when applicable, limited to routes of at most 200 galactic units between systems, and only benefit a journey completed from one lane endpoint to the other. Public lanes have a best possible travel-time multiplier of 0.55.

Published equation (page 3):

- s = 0.55
- D = journeyLength
- B = existingLaneBlocks + blocksGained
- y0 = 2 - s
- L = 2 - 2*s
- k = -0.00023 * ln(D) + 0.0017
- M = y0 - L / (1 + exp(-k * B))

Unknown: current lane registry and modifiers, exact point of application relative to spool time and skill, and exact distance metric. Do not assume multi-hop routing is automatic.

Navigation data collection: only lead ship in squad; heavy freighter buffer 500 blocks, fighter 250 blocks. Data collected at end of hyperjump when sensors enabled. No data for jumps longer than 200 galactic units.
