# Galaxy Hyperlane Map — source review

Source: user-supplied two-page SWC Galaxy Map: Hyperlane Map PDF, captured Year 27 Day 323.

- The map explicitly displays the top 45 public hyperlanes, ordered by speed; the page offers alternate ordering by efficiency or length. It is **not** a complete public registry.
- Top entries show `Speed Modifier: 45%`; lower entries show 44.9%, consistent with the documented maximum 45% travel-time saving (time multiplier 0.55).
- Examples at 45%: Pyria–Halowan, Cortina–Endor, Republica–Tythe, Chorios–Thanos.
- Neither Eberon nor Kashyyyk is in this particular top-45 table; absence from the top-45 does not imply absence of local hyperlanes. Eberon cockpit observations show many local connections.
- Map visualization alone does not establish system coordinates, full network graph, or multi-hop routing support. Don't infer specific edges beyond labels in the table.

Implication: logistics optimizer needs a route-specific edge table (endpoints, modifier, capture date/source), and must not use the top-45 list as the complete galaxy hyperlane graph.
