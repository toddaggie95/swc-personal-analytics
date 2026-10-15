# Sublight Distance: Working Hypothesis

## H-001 — System-coordinate distance

**Classification:** High-confidence user-observed hypothesis (not independently verified)

**Source:** Long-term in-game travel observations reported by player, 2026-10-14.

**Proposed distance:** `D = max(abs(x2-x1), abs(y2-y1))`, where the points are SWC system coordinates. This is the Chebyshev / L-infinity distance, measured in grid units.

**Example:** (5,10) to (18,17): dx=13, dy=7, D=13.

**Confidence:** Strong theory based on several years of observation; do not promote to documented/verified until confirmed by official rules or controlled observations.

**Next validation:** Capture exact ship model, actual displayed speed, pilot skills, start and destination coordinates, and original sublight duration in seconds. Fit duration against D; test axis-aligned and diagonal routes where possible. Keep the distance rule separate from travel-time conversion, rounding, and minimum time rules.
