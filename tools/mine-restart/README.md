# Kashyyyk mine restart discovery

From the repository root, use Node.js 24. The runner identifies Mine facilities by type UID `4:36` and Kashyyyk by system UID `9:104`. Give it one existing access token with the facility inventory read scopes for the owners you request. The token is read from `SWC_ACCESS_TOKEN`. Use a new path under the ignored `.validation` directory for each report.

```text
node tools/mine-restart/discover.mjs --owner 20:1174 --owner 20:1838 --output .validation/kashyyyk-live.json
node tools/mine-restart/discover.mjs --snapshot CAPTURE.raw-owner-inventory.json.gz --output .validation/kashyyyk-saved.json
```

Repeat `--snapshot` for additional planet captures. The live runner uses the same inventory filters, OAuth header and page pacing as the existing collector. This checkout restores that collector from pinned history in hosted workflows. The new runner uses an already-issued token and GET requests only, including on failure. Live scope is the specified owner inventories in the system. An unsuccessful page aborts the run. The report identifies the scope and gives each mine's classification and reasons. Treat the report as private inventory data.

The API provides facility type, location, power, wreck and construction flags, infotext and tags. The captured mine rows omit action state, deposit material and balance, and storage headroom. The broad `working` filter and operator assignment cannot establish an existing paused mining action. Facility-detail GET is documented, but its published examples do not establish mining-specific semantics. Material-pile CSVs and the production-sync totals measure stored inventory. The mining rules also allow overflow into same-owner storage in the city. Use observed mining controls or an authoritative equivalent to establish deposit and valid storage figures. [Inventory collection](https://www.swcombine.com/ws/v2.0/documentation/inventory/uid/entity_type/assign_type/) · [Facility detail](https://www.swcombine.com/ws/v2.0/documentation/inventory/entity_type/uid/) · [Mining rules](https://www.swcombine.com/rules/?Mining)

## Operational evidence

Optionally add `--evidence PATH` with the following normalized CSV headers. This CSV is a UID-keyed supplement prepared from authoritative observations. It uses the repository CSV parser and material vocabulary.

```csv
uid,observed_at,source,mining_status,deposit_material,deposit_remaining_units,available_storage_units,required_storage_units,notations_checked,notes
```

Use an ISO 8601 timestamp with timezone, a source reference, and explicit activity state. Use whole units of the deposit material for remaining deposit, usable storage and the amount the next cycle requires. Include only valid destinations and account for other cargo and both relevant capacity limits. Leave unknown values blank. Use `notations_checked=yes` after checking additional operator or faction notations. Supply any additional notes in `notes`. An explicit hold excludes the mine. Other nonempty notes or tags require review. An eligible mine requires live inventory and operational evidence from the past two hours.

The default allowlist is provisional. It is the union of the materials in the cited Mine and Consular-class Cruiser bills. Override it with `--materials` and a comma-separated list matching the materials wanted for your facility and ship builds. The repository's existing 21-material vocabulary covers general inventory and is broader than this policy. [Mine bill](https://www.swcombine.com/rules/?Facilities=&ID=36) · [Consular-class Cruiser bill](https://www2.swcombine.com/rules/?ID=66&Ships=)

## Proposed one-mine write pilot

1. Select one eligible mine from a fresh live report. Verify from the game controls that it has an existing paused mining action and can resume with the current operator and workers. Confirm the intended material, remaining deposit, usable storage for the next cycle, expected costs and all notations. Agree with the operator on the response if the mine resumes unexpectedly or fails to resume.
2. Confirm with SWC documentation or support that the generic facility action operation targets that single mining action and identify its minimum write scope. The documentation lists a generic `action` property with a resume value and no action ID selector. The mining rules also describe operator reassignment as a way to continue a mine. Treat reassignment as a separate operation requiring its own approval. [Entity property operation](https://www.swcombine.com/ws/v2.0/documentation/inventory/entity_type/uid/property/) · [Mining rules](https://www.swcombine.com/rules/?Mining)
3. Present the exact mine UID, owner, planet, verified action and proposed one-time request for explicit approval. Bind approval to the UID and action, set a short expiry and use only the minimum write scope. Immediately before submission, re-read identity, operator, action, deposit, capacity and annotations. Abort if any required value changed, is unavailable, or more than one action could be targeted. Require a new approval after any abort.
4. Send one single-entity request once. Record the request time, mine UID, response status and result without credentials. Verify the same mine's mining state with a fresh read. On timeout, conflict, ambiguous result or unexpected state, inspect the current state and stop for operator review. A retry or compensating change requires separate approval.

## Hosted single-mine API probe

The manual SWC API - Kashyyyk Mine Detail workflow uses the same GitHub Actions
environment and stored OAuth credential as Production Sync and planet capture.
It shares their concurrency group. It makes one facility GET with the existing
access token and stops if that token is near expiry. The job summary reports
field names only. Raw facility data stays on the temporary runner.
