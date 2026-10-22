# Expanded 148-hub validation — 2026-10-22

## Scope
All 20 system tabs, 148 hub blocks. Hub centers and target HAS coordinates were read from the live SWC Production workbook and committed to `hubs.production.json`.

## Local validation
- Input: TFF/TJO material and station exports supplied in this project.
- Distinct material piles: **4,445**.
- Distinct stations: **2,375**.
- Station-held material piles: **1,681**.
- All 7 unit tests passed in the local Node.js test implementation.
- Independent 51-hub baseline: 1,071 material totals compared to original Perl output; **zero differences**.
- Full 148-hub run: **40 material piles matched multiple hub areas**, exit code 2 (review required); 601 station-held piles unassigned to any hub.
- Overlapping material piles: Tholatin 22, Uogo\`cor 13, Randon 5.
- **Tholatin (8,8)** appears as two distinct spreadsheet blocks with the same center. Do not silently allocate both.
- Other overlapping 3×3 hub geometries may have no current inventory but must be tracked.

## Workbook cross-check: total calculated HAS versus current live HAS
| System | Engine total | Current workbook | Difference |
|---|---:|---:|---:|
| Kashyyyk | 935589 | 935589 | 0 |
| Eberon | 603902 | 603902 | 0 |
| Dalchon | 730027 | 730027 | 0 |
| Randon | 696498 | 280695 | +415803 |
| Oshora | 440 | 440 | 0 |
| Clantaano | 663068 | 663068 | 0 |
| Tholatin | 2403350 | 2062854 | +340496 |
| Messert | 1240034 | 1237024 | +3010 |
| Saki | 1840732 | 1840564 | +168 |
| Mechis | 770197 | 770197 | 0 |
| Lexrul | 1882980 | 1998013 | -115033 |
| Uogo\`cor | 2569735 | 1813157 | +756578 |
| Daluuj | 1136387 | 1136387 | 0 |
| Krmar | 986437 | 986437 | 0 |
| Lannik | 693258 | 693258 | 0 |
| Chamble | 485985 | 485985 | 0 |
| Harrin | 211138 | 211138 | 0 |
| Ota | 18909 | 18909 | 0 |
| Rakhuuun | 197012 | 197012 | 0 |
| Teljkon | 19753 | 0 | +19753 |

**Important:** These are system-wide sum-of-hub comparisons, not individual-cell parity proofs. Some differences may reflect overlapping 3×3 regions, special standalone-yard treatment, or pre-existing manual allocations. A system-level match does not establish all cells match.

## Safety status
**No live Google Sheets cells changed by this validation.** Do not enable a HAS writer until duplicate-center handling, overlapping rings, and exceptions are explicitly defined and per-hub comparisons pass.

## Next
1. Review duplicated Tholatin 8,8 blocks and whether they represent distinct shipyard groups sharing storage.
2. Resolve overlapping 3×3 hub areas using explicit allocation policy or record intentional shared visibility while preventing logistics double-count.
3. Compare all 148 hubs × 21 materials against current HAS; produce precise per-cell diff and provenance ledger.
4. Integrate permanent golden Perl fixtures into repository CI, not just an ad-hoc local parity run.
5. Add guarded HAS-only Google Sheets writer with readback verification.
