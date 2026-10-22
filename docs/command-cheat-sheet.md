# SWC Personal Analytics — command cheat-sheet

Run commands in PowerShell from your `swc-personal-analytics` project folder.
All inventory commands read SWC data; they do not change your in-game assets.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run cli -- help` | Show the command list. |
| `npm run status` | Show configuration readiness, private storage location and token-file timestamp. Does not contact SWC or prove authorization works. |
| `npm run sync:ships` | Export personally owned ships. |
| `npm run sync:stations` | Export personally owned stations. |
| `npm run sync:faction-materials` | Export owned material piles for both TFF and TJO. |
| `npm run sync:faction-materials:tff` | Export TFF materials only. |
| `npm run sync:faction-materials:tjo` | Export TJO materials only. |
| `npm run sync:faction-stations` | Export owned stations for both TFF and TJO. |
| `npm run sync:faction-stations:tff` | Export TFF stations only. |
| `npm run sync:faction-stations:tjo` | Export TJO stations only. |

TFF = The Faerytail Family. TJO = The Faerytail Family: The Je`daii Order.
Faction visibility depends on your SWC permissions. Counts represent what the API returns.

Personal inventory uses `sync:ships` and `sync:stations`; faction inventory uses the
`sync:faction-` prefix. Personal material export is not implemented.

## Materials: optional system or planet refresh

```powershell
npm run sync:faction-materials:tff -- --system "Kashyyyk"
npm run sync:faction-materials:tjo -- --planet "Kashyyyk"
npm run sync:faction-materials -- --system "Kashyyyk"
```

Omit the location option to collect the full faction inventory. Filtered collection resolves the name
and sends the location UID to SWC on every page; it does not download the full faction and filter locally.
Material filter support is covered by offline tests; a live filtered-material run still needs validation.

Each run creates a new snapshot. It does not merge into earlier exports or update Google Sheets.
A location snapshot is not a faction total. When replacing a system's sheet data, reconcile by pile UID
and remove old entries absent from the newly completed scope. A pile absent from this system may have
moved elsewhere; do not label it destroyed or delete it from a faction-wide inventory without verification.
Do not update sheets from failed/partial runs. Export summary.locationFilter records the selected scope.

## Facilities: choose one planet or system

Facility commands require exactly one location option. Replace Kashyyyk with the desired name.
Keep names in quotes, especially when they contain spaces. Keep the extra `--` after the npm script name.

| Scope | Example command |
| --- | --- |
| TFF, one planet | `npm run sync:faction-facilities:tff -- --planet "Kashyyyk"` |
| TJO, one planet | `npm run sync:faction-facilities:tjo -- --planet "Kashyyyk"` |
| Both factions, one planet | `npm run sync:faction-facilities -- --planet "Kashyyyk"` |
| TFF, whole system | `npm run sync:faction-facilities:tff -- --system "Kashyyyk"` |
| TJO, whole system | `npm run sync:faction-facilities:tjo -- --system "Kashyyyk"` |
| Both factions, whole system | `npm run sync:faction-facilities -- --system "Kashyyyk"` |

The app resolves the name to an SWC location ID, filters on the server, and checks returned location IDs.
A system covers its planets; a planet filter covers only that planet. An unresolved name stops collection.
Faction material commands also accept these location options; ship and station commands do not. There is no unfiltered facility command.

Facilities are collected in pages of up to 200, with a 6.5-second pause between pages. Large collections
can take several minutes. Run one sync at a time and let it finish. Smaller collections still share SWC's
rate allowance. A cooldown can stop the batch before the second faction is attempted.

## Station production details

Basic `sync:faction-stations` exports remain inventory lists. To make an enriched file for another chat:

```powershell
npm run sync:faction-stations:tjo
npm run enrich:faction-stations:tjo -- --system "Kashyyyk"
```

For TFF, use `sync:faction-stations:tff` then
`npm run enrich:faction-stations:tff -- --system "Kashyyyk"`.
Each enrichment command requires one `--system` or `--planet` and one faction.

The command uses that faction's newest saved full station inventory, selects the location, and fetches
one detail response per station with 6.5-second pauses. Allow roughly 22 minutes plus network time for
195 stations. No added OAuth scope is requested. Live detail visibility still depends on SWC permissions.

Completed details are saved in private `checkpoints`. If interrupted or rate-limited, rerun the SAME
enrichment command after the cooldown to resume. Do not run a new inventory sync between resume attempts:
that creates a new source inventory and starts a new enrichment. To refresh production later, run the
inventory sync first, then enrich again. Repeating enrichment on the same source reuses saved details.

Upload the new `tjo__stations-production__system-kashyyyk__...json` (or TFF equivalent).
Every station has `operations` containing API production actions, queue items (including designs where
supplied), tooling, cargo capacities, and construction flag. Action and queue structures retain worker,
quantity, status and delay fields as supplied by SWC. No units or running state are guessed.
`operations.observedAt` records when that station's details were read; inventory has a separate timestamp.

Missing fields are null, not idle or zero. Tooling alone does not prove active production. Only explicit
API action/queue statuses support active/paused claims. A completed detail fetch does not guarantee SWC
exposed every requested field. A failed enrichment does not produce a completed enriched export.
The implementation passes offline tests; live production detail mapping still requires verification.

## Authorize or add a newly requested permission

1. Run `npm run auth:start`.
2. Open the displayed URL in your browser, sign into SWC and approve the requested permissions.
3. In the same PowerShell window, run `npm run auth:finish`.
4. Paste the code into the hidden authorization-code prompt and press Enter. Hidden input is expected.
5. For this installation's verified code-only mode, leave the returned-state prompt blank. Other setups
   should follow [the OAuth runbook](oauth.md).

Finish promptly: the local authorization session expires after 10 minutes. Keep codes, client secrets,
and tokens out of chat and command-line arguments. Normal syncs reuse saved authorization and attempt
refresh automatically; do not reauthorize before every export.

## Where the exported data goes

The default Windows folder is:

```text
%LOCALAPPDATA%\SWC Personal Analytics
```

Open the readable exports in File Explorer:

```powershell
explorer "$env:LOCALAPPDATA\SWC Personal Analytics\normalized"
```

If you configured a different storage location, use `privateStorageDirectory` from `npm run status`.
The data folder is separate from the project folder; listing the project with `dir` will not show it.

| Folder/file | Purpose |
| --- | --- |
| `normalized\<descriptive-name>.json` | The analysis-ready JSON export. Each successful run creates a new file. |
| `raw\<descriptive-name>\*.body` | Original SWC response bodies for verification. |
| `raw\<descriptive-name>\*.meta.json` | Request details and response status. |
| `raw\<descriptive-name>\complete.json` | Marks a successfully completed inventory run. |
| `tokens.json` | Private credentials. Do not share or upload. |

Use the printed `exportFile` for the exact JSON path and `rawDirectory` for original responses. Both-faction commands create separate runs.
JSON contains a `summary` plus a `ships`, `stations`, `materials`, or `facilities` list. Facility summaries
include `locationFilter`; their count is for that location, not the entire faction.
`materialLots` counts piles, not units or tonnage. Missing fields mean unknown, not zero.
Failed runs may retain raw responses but do not create a completed normalized inventory export.
These exports are private local files and are not pushed to GitHub.

## Export naming convention

New inventory exports use:

```text
<owner>__<inventory>__<scope>__<UTC timestamp>-<unique run ID>.json
```

| Part | Values/examples |
| --- | --- |
| Owner | `personal`, `tff`, `tjo` |
| Inventory | `ships`, `stations`, `materials`, `facilities` |
| Scope | `all`, `system-kashyyyk`, `planet-kashyyyk` |
| Timestamp | Run start in UTC, e.g. `2026-10-22T03-42-11-970Z` |
| Unique suffix | Full random UUID, keeping separate runs distinct |

Examples below abbreviate the timestamp and unique suffix as `<run-id>`:

```text
personal__ships__all__<run-id>.json
tjo__stations__all__<run-id>.json
tff__materials__system-kashyyyk__<run-id>.json
tjo__facilities__planet-kashyyyk__<run-id>.json
```

Names become lowercase with punctuation/spaces replaced by hyphens. The JSON summary retains the actual
location name and UID. `all` means no location filter; it does not mean both factions.
Raw inventory folders use the same descriptive pattern without `.json`. Inside them, numbered `.body`
and `.meta.json` pairs preserve request order, and `complete.json` marks inventory completion.
Standalone diagnostics may still use run-ID-only raw folders. Internal credential/configuration filenames
are unchanged. Older exports are not renamed. The naming pattern applies to new inventory exports only.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| HTTP 429 / rate limit | Stop retrying. If a retry time is shown, wait until then. Otherwise allow the rate window to recover before trying again. |
| Authorization/refresh failure | Run `npm run status` in the same terminal used to authorize. Check the storage path and token timestamp; report the safe error text. |
| HTTP 403 / denied access | Check the granted read permission and your faction's in-game access. Do not interpret failure as zero assets. |
| Missing location option | Add `-- --planet "Name"` or `-- --system "Name"` to a facility command. |
| Location cannot be resolved | Check the exact planet/system name and the selected option. |
| Unexpected zero count | Compare with the web inventory before treating it as authoritative. Older facility exports using name-only filters returned false zeros; rerun with the corrected app. |
| No export file | Check the private storage path, run ID and whether the run actually completed. |

A sync is a paginated observation, not an instantaneous snapshot. Changes during collection can cause
consistency checks to stop the run. Existing successful exports remain available.

## Diagnostic and maintenance commands

These are not needed for routine collection.

| Command | Purpose |
| --- | --- |
| `node scripts/probe-facility-filter.mjs` | Fixed TFF/Kashyyyk-planet diagnostic: tests name, numeric ID and full UID with one row each. Makes up to three inventory requests; not a full export. Uses built files, so run `npm run build` after source changes. |
| `npm ci` | Install the project's locked dependencies during setup. |
| `npm run typecheck` | Check TypeScript without contacting SWC. |
| `npm test` | Run offline automated tests. |
| `npm run build` | Build the application into `dist`. |
| `npm run check` | Run typecheck, tests and build together. |

## Current limits

Exports are JSON, not automatic CSV or Excel files. There is no command to update Google Sheets.
Production queues, tooling, worker counts, capacities and timers are omitted from basic inventory exports.
Use the station enrichment commands above to retain fields supplied by the individual-station API. There is no standalone character-profile
export command, though syncs retrieve character information to establish ownership and faction access.

For setup details, see [the OAuth runbook](oauth.md) and [README](../README.md).
