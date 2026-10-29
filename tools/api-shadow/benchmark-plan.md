# SWC API shadow collection: benchmark and deployment gates

This plan is **shadow-only**. Do not edit or invoke production HAS, Production Overview, Production Changes, watched manual-export folders, or Google Sheets.

## Authentication deployment gate

The OAuth client currently persists a rotating refresh token in `tokens.json` under an external private directory. Ephemeral GitHub-hosted runners cannot retain this file between runs. **Do not enable authenticated scheduled collection until a secure, durable, atomic token-store strategy is implemented and tested**. Repository secrets alone are static and cannot safely persist rotated refresh tokens. Do not log, artifact, or commit tokens.

Initial deployment options to evaluate:
1. Secure external secrets store with versioned writes, workload identity and least privilege.
2. Self-hosted dedicated runner with encrypted persistent storage, exclusive lock, and maintenance responsibilities.
3. Explicit reauthorization for each bounded experiment, if feasible, without storing credentials in CI.

Never place credentials in workflow_dispatch inputs. Never run untrusted pull-request code with production OAuth secrets.

## Bounded live benchmark

- Manually triggered, read-only, approved ref only.
- Initial maximum: 10 station detail requests; wall-clock limit 10 minutes; no unbounded retries.
- Emit redacted aggregate telemetry: request count, success/error count, retry count, elapsed time, response size buckets, quota remaining/reset metadata, inventory-vs-detail observation span, and sampled field-presence counts.
- Keep raw API bodies and identifying station/material exports in private storage, not publicly downloadable artifacts.
- Compare same UID sample against near-contemporaneous manual exports; flag unknown, mismatched and stale fields instead of inferring success.
- Repeat small benchmark with 1-second, 3-second, and adaptive serial pacing only when actual server quota permits. Stop at rate-limit exhaustion; no evasion.
- Before full inventory: prove pagination, restart safety, complete UID sets, production detail field equivalence, and no output writes to production.

## Offline gates

Run `npm ci && npm run check` on the isolated API branch. Review CI failures and do not claim passing until verified.
