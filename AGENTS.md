# Repository guidance

## Star Wars Combine API reads

- Start with the existing SWC OAuth coordinator, read client, and production rate limiter when adding a runner, a workflow, or an endpoint. Extend the shared read client for new endpoints when its request and response contracts fit. A standalone Node entry point that cannot use the compiled client should still use `tools/api-parity/production-read-pacer.ts` and the existing GET transport conventions.
- Hosted readers that use the shared credential use the `swc-api-shadow-oauth` concurrency group. The durable OAuth coordinator handles refresh and persistence. Read workers receive access tokens and do not refresh or rotate them.
- Use one quota budget across inventory pages and detail calls. Honor rate headers and the reserve in the shared limiter. Use its fallback pacing and stop or checkpoint when quota or time is exhausted. Avoid a separate fixed-delay loop or per-endpoint quota budget.
- For large collections, follow the production pattern in `.github/workflows/production-api-inputs.yml` and `tools/api-parity/production-batches.mjs`. Use bounded batches and encrypted resumable progress where needed. Verify coverage, include request and pacing metrics, and carry partial coverage into reports.
- Keep SWC writes behind a separate explicitly authorized path. Do not add writes to the shared read flow. Avoid logging credentials or private inventory values.
- If a workflow needs a separate transport or quota budget, document the reason in the change and verify its read-only behavior, rate-limit handling, and timing against the shared implementation.
