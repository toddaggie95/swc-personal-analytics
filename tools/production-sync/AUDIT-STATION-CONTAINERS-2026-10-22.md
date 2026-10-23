# Production station-container coverage audit (TFF + TJO exports, 2026-10-22)

Inputs: 2,375 unique stations and 4,445 unique material piles from the four SWC web exports. Scope: the 20 live production-system tabs. Materials are deduplicated by exact pile UID.

| Category | Piles | Units |
| --- | ---: | ---: |
| Station-held materials in production systems | 1,579 | 32,440,463 |
| Of which station UID absent from station exports | 5 | 3,465 |
| Of which station UID present | 1,574 | 32,436,998 |

The 5 missing-station piles occur in only 3 station containers:

| System | Station UID | Name | Piles | Units |
| --- | --- | --- | ---: | ---: |
| Eberon | `5:34613` | Sifu's fabulous SY2 | 2 | 333 |
| Harrin | `5:4966` | [NK] HPY-SY1-B | 1 | 207 |
| Mechis | `5:16514` | VS Sy1#2 | 2 | 2,925 |

These are missing from the combined **station export**, not proven missing from SWC. They may be third-party/otherwise inaccessible stations. Preserve them as a separate review queue and never infer hub membership from coordinates alone.

Outside the 20 production systems, another 57 station-held piles reference stations absent from the station exports, totaling 1,070,042 units. These must not be used to inflate production hub HAS values.

## Guardrails

- Count only `container_type_name=Stations` for station HAS allocation.
- Verify `container_uid` against deduplicated station `uid`.
- Keep absent station containers in a separate inventory review queue.
- Conservation: known-container units + missing-container units must equal total station-held units for the 20 systems.
- Never use proximity alone to assign these missing containers.
- This audit is **not** a complete per-HAS-cell parity verification; that remains pending.
