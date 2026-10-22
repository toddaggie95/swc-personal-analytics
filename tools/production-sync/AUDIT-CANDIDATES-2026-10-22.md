# Station candidate audit — 2026-10-22

From the TFF/TJO exports: 2,375 unique stations and 4,445 unique material piles. Against the 128 audited hub centers, using same-system and Chebyshev distance <= 1:

- Exactly one candidate hub: 1,087 stations.
- Multiple candidate hubs: 11 stations (9 Tholatin, 2 Lexrul); all are shipyards.
- No candidate hub: 1,277 stations (includes unrelated stations and standalone yards).
- The ambiguous shipyards hold 11 material piles totaling 276,642 units, all in Tholatin.

This is proximity evidence, not approved station membership or per-cell HAS validation. Never double-count ambiguous piles. Review station UID, tags, tooling, and audited allocations before enabling a live writer. The prior 148-block overlap counts refer to a different layout and are not directly comparable.
