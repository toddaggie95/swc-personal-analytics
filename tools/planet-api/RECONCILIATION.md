# Durable actual-state reconciliation

This pipeline separates acquisition, immutable observations, evidence supplements,
accounting, historical comparisons and later planning. It never edits a sheet.
Reservations and proposed builds are excluded from every actual-state total.

## Acquire once, analyze repeatedly

The existing `swc-planet-full-capture.yml` captures one selected planet using one
durable OAuth coordinator and access-only bounded detail workers. It collects
complete accessible owner inventories, public planet/city references, available
city buildings/layouts and the complete paginated facility-type catalog. It keeps
all returned fields in encrypted source artifacts, including fields not yet
normalized. Resource denials and missing fields remain named gaps.

`swc-planet-owner-survey.yml` discovers planets represented in all accessible
TFF-family owner facility/city inventories. Actual page lengths advance pagination;
stable totals, unique UIDs and exact owners are required. Rows without planetary
locations remain explicit unlocated records. Additional affiliated owners can be
permission-checked once using an encrypted seed snapshot; inaccessible owners do
not provoke OAuth reauthorization or retries. This is a coverage survey, not a
claim that all foreign assets on every planet have been discovered.

Raw observations and all local analyses belong in a private evidence directory
outside Git. Download encrypted artifacts before their hosted retention expires.
Retain source hashes, observation times, exact run IDs and a local file manifest.
Never store OAuth tokens or private decryption keys in a source or report archive.

## Offline evidence contract

`reconcile-planet.mjs` consumes a verified immutable snapshot and an evidence JSON:

```json
{
  "schemaVersion": 1,
  "planetUid": "8:1",
  "sources": [{
    "source": {
      "id": "dated-web-export",
      "reference": "Private source file and exact tab/range",
      "currency": "current",
      "observedAt": "2026-11-16T00:00:00Z",
      "sha256": "source hash"
    },
    "facilities": [{
      "layer": "actual", "uid": "4:100", "typeUid": "4:7",
      "ownerUid": "20:2", "underConstruction": false
    }],
    "controls": [{"field":"flats","value":10,"units":"flats","tolerance":0}],
    "aggregate": {
      "scope": "historical all-owner physical inventory",
      "byType": [{"typeUid":"4:7","count":1}]
    }
  }]
}
```

Use `historical` currency for dated old exports and `user_observation` for a user
statement without a separately established observation timestamp. The latter may
fill directly asserted fields but does not silently certify current independent
planetary controls. A type's presence in an aggregate does not create a facility
UID or resolve construction/power/ownership. Historical rows are retained for
comparison, never silently overlaid onto current records. Scope aggregate owner
filters explicitly; old faction ownership may have changed through transfers.

UID is the primary identity. A source without one needs a unique city UID,
actual local coordinates and exact whitespace-normalized name. Conflicting known
fields are reported, not overwritten. Boolean state fields must be actual
booleans; absent values are unknown. Only explicit completed, nonwrecked records
with known type economics contribute to the completed totals. Under-construction
facilities remain represented but excluded. Powered status alone does not invent
a completion flag. Report observational and model assumptions separately.

`layout-evidence.mjs` learns a type crosswalk from independently identified
buildings at observed layout anchors. Numeric API and Designer IDs are not assumed
equivalent. Known mappings must be consistent; complete city anchor coverage and
known type consistency are required before supplementing missing types. Layouts
cannot supply a missing owner, completion flag or power state.

Run locally, using only saved evidence:

```sh
node tools/planet-api/run-reconciliation.mjs SNAPSHOT.json EVIDENCE.json PRIVATE_OUTPUT
```

Use `-` instead of an evidence path for API-only accounting. Output names contain
the result hash. Existing identical results are reused; different contents cannot
overwrite an immutable output. Each result includes the original snapshot hash,
evidence hash, supplements, exclusions, unresolved records, signed control/type
differences and reported-income coverage. `reconcileFleet` builds a per-planet
registry without combining planetary totals or hiding partial planets.

## Accounting and income evidence

`accounting-rules.json` records the official Each1â€“Each6 classification lists,
source pages, displayed revisions and retrieval date. `planet-accounting.mjs`
calculates exact scaled jobs, flats, area, crime-group sums and published reference
statistics from explicitly actual count rows. Tax fraction and surface-square
count are required inputs. Raw morale, undefined denominators and unverified
rounding/clamping are labeled; no secret parameter defaults are inserted. A
historical count model remains historical even if current public controls agree.

`income-evidence.mjs` verifies the snapshot and its linked inventory before retaining
income, debt, manager/operator, open-to-all and power evidence. Actual sample
medians and descriptive distributions are saved. Absence is not zero. Current
ownership is distinct from the current manager, and neither establishes the
beneficiary or eligibility at income generation. Unknown generation times and
activity/skill remain explicit, so a large sample from one unknown cycle cannot
be presented as many independent planetary-state experiments.

## Completion gates

Statuses distinguish incomplete coverage, conflicting evidence, current-control
mismatches, missing current controls and observed-control agreement. Even control
agreement does not certify all physical owners or optimization readiness. Retain
freshness, inaccessible cities, unknown statuses and historical-only evidence in
the registry. Do not infer demolition from a disappeared or inaccessible row.

Only after reconciliation should a separate planning stage apply terrain/Mine
reservations, layouts, power, manager eligibility, costs, parameter sensitivity and
beneficiary-specific income objectives. None of those planning policies may
inflate current physical totals.
