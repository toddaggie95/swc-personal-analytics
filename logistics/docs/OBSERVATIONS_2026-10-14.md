# SWC live cockpit observations — 2026-10-14

Source: user-supplied cockpit screenshot (retain screenshot privately; do not upload image or identifying ship data to public repository).

## Sublight
- Ship class/model: BFF-1 Bulk Freighter, published sublight 20 MGLT.
- Pilot skill: Fighter/Freighter Piloting 3.
- System: Eberon (galactic coordinates 224,93).
- Current displayed system position: (5,8).
- Destination shown: (5,7).
- Remaining countdown: 06:47 at screenshot capture. **Not** original trip duration. Current position is not necessarily the starting position; don't infer seconds per square.

## Hyperlanes
Local cockpit registry shows route-specific accumulated blocks and displayed `Travel Speed Increase` values. Examples from Eberon:
- Foless: 6682 blocks; 41.7%
- Daltarra: 2890 blocks; 27.1%
- Messert: 705 blocks; 15.2%
- Thanos: 627 blocks; 11.4%
- Ku'Bakal: 751 blocks; 8.3%
- Tholatin: 330 blocks; 8.0%

Important: UI says `Travel Speed Increase`, whereas rules give `timeModifier`. Do not assume direct equivalence or subtraction until verified. Navigational data collection enabled; buffer 4/500 blocks.

## Next
Obtain a fresh trip's start/destination, exact initial duration in seconds, and ship/pilot. Investigate displayed speed-increase definition and reconcile with published modifier equation.
