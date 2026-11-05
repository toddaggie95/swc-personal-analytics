# SWC GitHub Actions workflow inventory (2026-11-05)

The GitHub Actions display name is the YAML `name:`, which may differ from the filename. The default branch (`main`) currently holds the production workflows, two credential troubleshooting workflows, and a reusable station diagnostic. Experimental workflows on `feature/kashyyyk-parity-readonly` should not be deleted or merged without verifying downstream references and run history.

## Production: retain
- `swc-production-dry-run.yml` — **SWC Production Sync** on main; CSV import/HAS updates. A research-branch version is named **SWC production API/CSV sync**. Treat main as authoritative.
- `production-overview-readonly.yml` — **SWC production overview readiness and publish**; downstream of production sync.
- `production-sync-tests.yml` — **Production sync tests**; regression safety.

## Active API development: retain
- `swc-api-parity-tests.yml` — **SWC API parity tests (read only)**; research branch CI.
- `swc-api-canonical-tests.yml` — **SWC API Canonical Adapter Tests**.
- `swc-api-performance-experiment.yml` — **SWC focused API performance experiment**; targeted research.
- `swc-daluuj-diagnostic.yml` on main — **SWC API Station Diagnostics**; reusable manual diagnostic with `system` and `station_uid` inputs; reads experimental branch code without merging it.

## Troubleshooting: retain for now
- `swc-api-shadow-credential-preflight.yml` — **SWC API Shadow - Credential Preflight**.
- `swc-api-shadow-oauth-probe.yml` — **SWC API Shadow - OAuth Probe**.

## Historical research candidates for consolidation / archive after dependency audit
- `swc-api-shadow-chamble-parity.yml` — inventory and calculated output parity.
- `swc-api-shadow-live-stations-pilot.yml` — system-scoped station inventory pilot.
- `swc-api-shadow-live-system-pilot.yml` — system-scoped materials pilot.
- `swc-api-shadow-offline-beta.yml` — offline collector beta.
- `swc-api-shadow-pipeline-beta.yml` — download-to-parity beta.
- `swc-kashyyyk-workbook-capture.yml` — Kashyyyk workbook readiness capture.

**Cleanup policy:** Do not remove any workflow until its remaining unique capabilities and dependencies are confirmed. GitHub may continue showing previously registered workflow entries even after YAML deletion; disabling entries through the Actions UI/API may be required for actual sidebar cleanup. No production workflow is to be deleted or disabled as part of experimental cleanup.
