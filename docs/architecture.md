# Architecture

The first release is a local CLI, with no HTTP listener or ChatGPT-accessible bridge.

```text
config → guarded CLI → SDK OAuth / durable tokens
                    → fixed read transport → RAW body + metadata
                                           → validated inventory pages
                                           → NORMALIZED station snapshot
                                           → completion marker
future: NORMALIZED + canonical types + galaxy topology → DERIVED analytics → read-only bridge
```

- `src/config`: fixed scopes, base URL, OOB redirect, private path and activation gates.
- `src/auth`: SDK OAuth, random state, optional PKCE, single-use pending session, awaited token persistence.
- `src/swc`: read-only endpoint allowlist, bounded retries, schema guards and exhaustive pagination.
- `src/storage`: atomic files, exclusive operation lock, byte-preserving response snapshots with hashes.
- `src/models`: minimal station identity/type/owner/provenance and nullable coordinate normalization.
- `src/analytics`: reserved for later derived computations.
- `src/cli`: safe summaries and hidden interactive authorization result entry.

RAW keeps every received data response, including failed requests. A body file contains the exact bytes
delivered by fetch after HTTP decompression, not a JSON reserialization or the SDK's transformed object.
Metadata intentionally contains no request headers, cookies, OAuth responses, codes or credentials.
Responses not fully received because of network failure cannot be captured.

NORMALIZED is a versioned minimal projection, never a substitute for RAW. Absent names/types/coordinates
remain null, not invented values. Owner UID is query provenance from the owner-assigned inventory; it is
not inferred from display text. More entity references, action/tooling/production/mining details and richer
timestamps can be added with explicit migrations. Unknown API fields survive unchanged in RAW.

Only a finished run gets a completion marker. A failed run never publishes a success marker, though raw
pages (and, if final disk writes fail, an uncommitted normalized file) may exist. Future readers must require
the completion marker. Current pagination checks detect changing totals, duplicate UIDs and stalled pages;
they cannot establish transactional consistency if assets move between pages while the total stays equal.

For SQLite, retain immutable raw files and index completed snapshots, typed entities and observation times.
Keep type catalogs and galaxy topology in separately versioned caches. No DB engine is needed for this proof.

Future bridge operations may include inventory_summary, stations(owner), get_entity, search_inventory,
assets_at and controlled refresh. Authenticate callers, return bounded normalized results, and isolate
refresh jobs from query handlers. Do not expose arbitrary SWC endpoints, tokens, raw files, or write methods.
Add ships/facilities/faction scopes only with a new intentional consent decision.
