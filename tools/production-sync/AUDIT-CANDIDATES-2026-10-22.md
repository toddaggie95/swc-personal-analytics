# Station candidate audit — 2026-10-22

From the TFF/TJO exports: 2,375 unique stations and 4,445 unique material piles. Against the 128 audited hub centers, using same-system and Chebyshev distance <= 1:

- Exactly one candidate hub: 1,087 stations.
- Multiple candidate hubs: 11 stations (9 Tholatin, 2 Lexrul); all are shipyards.
- No candidate hub: 1,277 stations (includes unrelated stations and standalone yards).
- The ambiguous shipyards hold 11 material piles totaling 276,642 units, all in Tholatin.

This is proximity evidence, not approved station membership or per-cell HAS validation. Never double-count ambiguous piles. Review station UID, tags, tooling, and audited allocations before enabling a live writer. The prior 148-block overlap counts refer to a different layout and are not directly comparable.

Detailed pile check: all 11 ambiguous material piles (276,642 units) belong to **one station**, Tholatin Shipyard IV `5:19840` at (9,13), tagged `TFF Tholation IV Ring`. The other 10 ambiguous shipyards hold zero material piles in this export. The candidate hub centers for this station are (9,12) and (10,14); do not choose either without comparing ring identity and audited HAS.
