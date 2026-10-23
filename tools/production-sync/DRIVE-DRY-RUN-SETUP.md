# SWC CSV dry-run workflow setup

This is a **read-only** workflow: no spreadsheet changes, no CSV commits.

## 1. Google Drive folder

Create a private Google Drive folder with these **exact filenames**:

- `TFF-Stations.csv`
- `TJO-Stations.csv`
- `TFF-Materials.csv`
- `TJO-Materials.csv`

The files should come from one collection period. Replace the four files when preparing a new run; do not leave duplicate filenames in the folder.

## 2. Google Cloud service account

In a Google Cloud project with the Google Drive API enabled, create a service account and a JSON key. Share **only the export folder** with the service account's email address as **Viewer**. The workflow requests the `drive.readonly` OAuth scope.

GitHub repository **Settings > Secrets and variables > Actions > New repository secret**:

- `SWC_GOOGLE_SERVICE_ACCOUNT_JSON`: the full JSON service-account key.
- `SWC_EXPORT_FOLDER_ID`: the folder ID from the Drive folder URL.

Never commit the JSON key. If your organization forbids service-account keys, use Workload Identity Federation instead; the workflow authentication step will need adjusting.

## 3. Enable and run

The workflow file currently lives on `feature/audited-production-destinations`. GitHub generally requires a `workflow_dispatch` workflow to exist on the repository's **default branch** before it appears in the Actions UI. Review and merge the workflow and script changes first, or otherwise arrange for the workflow to exist on the default branch. **Do not merge or publish the private CSVs.**

From **Actions > SWC production CSV dry run > Run workflow**, select the branch containing the audited manifest and script, then run.

## 4. Inspect the results

Download the `swc-audited-ledger` artifact from the workflow run. It contains `audited-ledger.json`, with every calculated HAS target and quantity. The artifact expires after 7 days. No raw CSVs are uploaded as artifacts.

The workflow stops on missing files, duplicate filenames, malformed exports, duplicate pile conflicts, missing mapped stations, and mismatched systems. Unassigned station inventory is reported separately for investigation.

## Current limitations

- The workflow has not yet been executed end-to-end; GitHub Actions credentials and Drive folder sharing must be configured.
- It does **not** compare against live Google Sheets values or write anything. The live-sheet comparison is the next phase.
- This workflow uses the current audited manifest and exact station IDs; if a station is missing from newer exports, the run fails rather than guessing.
- The service-account key must be protected as a repository secret. Prefer workload identity federation in production.
