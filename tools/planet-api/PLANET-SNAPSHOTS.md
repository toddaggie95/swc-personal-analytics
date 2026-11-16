# Durable planetary baselines

`appendReconciliationEvidence` creates a new revision linked to the immutable
parent hash. It can attach dated controls and evidenced owner classifications;
it cannot silently change physical observations or certify historical controls.
The original capture and each reconciliation revision remain separate files.

One capture creates a versioned `planet_reconciliation_snapshot` JSON document,
a readable report and a sourced facility-type catalog. Raw source responses and
partial detail batches are preserved separately. Everything uploaded is encrypted
to both the existing archive key and the configured local reader public key.
The local reader private key stays outside Git/OneDrive in local app-data storage.
GitHub artifact retention is 90 days; copy evidence to the private local archive
for long-term work. Neither public Git history nor the private optimizer Git
repository is a storage location for private entity snapshots.

## Snapshot contents

- Stable planet, city, facility and type UIDs; snapshot/version/hash and observation window.
- Exact completed owner inventories for accessible TFF-family memberships, with coverage and raw source hashes.
- City layouts and building lists across all known public/owned city references, preserving every physical owner.
- One physical facility record per UID, with all observation references. Conflicting identity/geometry/construction observations block assembly.
- Source-dated jobs/flats/dimensions per type and each facility's inclusion/exclusion decision.
- Per-owner, per-type and known completed totals, plus explicit unknowns and under-construction potential.
- Independent comparison controls and match/residual evidence when available. A capture starts `pending_independent_controls` or `incomplete_coverage`, never automatically `matched`.

Official facilities, API entity UIDs and Designer type IDs are distinct domains.
The type catalog is stored once per snapshot for offline reuse. Future captures
currently refresh it; this first implementation does not silently reuse stale
catalog metadata. Plans, historical foreign inventory and current observations
must be separate evidence layers. Do not sum aggregate historical counts with
fresh facility UIDs until overlap has been resolved.

## Collection

The sole OAuth coordinator uses the existing durable session and shared lock,
resolves the planet and authorized TFF-family factions, reads complete filtered
inventories and the paginated type index once. Private planet inventory endpoints
with known 401 restrictions are not requested. Fresh access-only workers read at
most 25 city/type details each, maximum four concurrently. The existing quota
reserve, fallback and request-start pacing implementation is reused. No per-facility
detail fan-out is needed where owner and city lists already provide the facts.

All required batches must have exact identity, coverage and a two-hour observation
window before assembly. Optional unavailable foreign cities remain a named gap;
denied owned cities and missing/partial required batches cannot certify a snapshot.
Missing building collections, power and construction flags are not assumed zero.
Unknown economic eligibility blocks a complete accounting claim. The first capture
uses completed nonwrecked facilities; explicit unknown/wrecked cases need a sourced
rule before inclusion. No geometry or construction-readiness claim is made here.

## Future comparisons

`compareSnapshots(before, after)` verifies snapshot hashes and compares stable UIDs.
It separates newly observed facilities, transfers, construction completions and
geometry/state changes. A disappeared observation is not automatically demolition.
Owner reclassification can be applied offline with a new snapshot revision and
evidence, without repeating API collection. Keep parent snapshot hash, revision
reason and changed assumptions whenever augmenting or reconciling a baseline.

Independent controls must record their own date/source/units/display precision.
Historical workbook values are historical controls; they are not silently labeled
current SWC totals. A pending or partial baseline may support research, but it does
not authorize production sheet edits or construction proposals.
