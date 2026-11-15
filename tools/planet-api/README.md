# Read-only planetary capability pilot

This generic acquisition tool contains no economic hypotheses or secret parameters.
Planning research lives in the private optimizer repository. All live data and
field evidence are encrypted before artifact upload; logs contain fixed outcomes.

One exact planet and the authenticated TFF faction are resolved before inventory.
The pilot reads one filtered page each of facilities/cities, up to three facility
details, two distinct facility types, one city detail from available references,
the planet's public and inventory views, and one facility type catalog page.
It does not claim complete all-owner coverage or a complete planetary capture.

At most 18 GET requests, serial 6.5-second pacing, no automatic data retries,
240-second request-start deadline, 30-second per-request timeout. HTTP 401/429
stops the run; 403/404 record a capability gap without retrying that resource.
The established durable OAuth session and cross-workflow concurrency lock are
reused. No scopes are added, no sheet authorization is present, no writes to SWC
or production accepted state occur. OAuth rotation may persist the current grant.

Transport shapes are grounded in pinned swcombine-sdk 3.5.0 resources and existing
filtered inventory support. Official endpoint documentation was inaccessible on
2026-11-15; live evidence must establish actual permissions and field availability.
Candidate SDK scopes include faction_inv_cities_read and faction_inv_planets_read,
but no reauthorization is justified until current access is tested.

Offline: `node --test tools/planet-api/capability-pilot.test.mjs`.
Live: the dedicated workflow on the reviewed branch. Inspect the encrypted report
before expanding page counts, faction coverage or enrichment. Income observation
time is not treated as generation time; missing data is never silently zero.
