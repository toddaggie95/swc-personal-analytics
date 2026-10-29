import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Read-only reconciliation of a local SWC web-export CSV and normalized API snapshot.
// Usage: node scripts/audit-station-production.mjs <CSV> <normalized JSON> [output JSON]
function parseCsv(input) {
  const table = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) table.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('Unterminated CSV quote.');
  if (cell || row.length) { row.push(cell); table.push(row); }
  const [headers, ...records] = table;
  if (!headers) throw new Error('Empty CSV.');
  return records.map(values => Object.fromEntries(headers.map((h, i) => [h.replace(/^\uFEFF/, ''), values[i] ?? ''])));
}
const str = v => String(v ?? '').trim();
const normalize = v => str(v).toLowerCase().replace(/[^a-z0-9]/g, '');
const [csvArg, apiArg, outputArg] = process.argv.slice(2);
if (!csvArg || !apiArg) throw new Error('Usage: node scripts/audit-station-production.mjs <stations.csv> <normalized-snapshot.json> [report.json]');
const csv = parseCsv(await readFile(resolve(csvArg), 'utf8'));
const snapshot = JSON.parse(await readFile(resolve(apiArg), 'utf8'));
if (!Array.isArray(snapshot.stations) || !snapshot.summary) throw new Error('Not a normalized station snapshot.');
const byUid = new Map(snapshot.stations.map(s => [str(s.uid), s]));
const csvUids = new Set(csv.map(r => str(r.uid)));
if (csvUids.size !== csv.length || byUid.size !== snapshot.stations.length || csvUids.has('') || byUid.has('')) throw new Error('Duplicate or blank station UIDs.');
const mismatches = [], nonShipyardProduction = [], nonShipyardTooling = [], toolingMismatches = [];
const counts = { csvStations: csv.length, apiStations: snapshot.stations.length, matchedUids: 0, csvOnly: 0, apiOnly: 0, enriched: 0, notChecked: 0, runningAgreement: 0, runningDisagreement: 0, toolingCompared: 0, toolingMatches: 0, toolingMismatches: 0 };
for (const row of csv) {
  const uid = str(row.uid), station = byUid.get(uid);
  if (!station) { counts.csvOnly++; continue; }
  counts.matchedUids++;
  const csvRunning = str(row.productionStatus).toLowerCase() === 'running';
  const csvTool = str(row['tooled-to']);
  const shipyard = /shipyard/i.test(str(row.type_name || row.type));
  const checked = station.operations?.status !== 'not-checked' && station.operations != null;
  if (!checked) {
    counts.notChecked++;
    if (csvRunning) nonShipyardProduction.push({ uid, type: str(row.type_name || row.type), csvStatus: str(row.productionStatus) });
    if (csvTool) nonShipyardTooling.push({ uid, type: str(row.type_name || row.type), csvTool });
    continue;
  }
  counts.enriched++;
  const actions = Array.isArray(station.operations.productionActions) ? station.operations.productionActions :
    (Array.isArray(station.operations.actions) ? station.operations.actions.filter(a => a?.attributes?.type === 'EntityProductionAction') : null);
  // Null actions are unknown, not a confirmed absence of production.
  if (actions !== null) {
    const apiRunning = actions.length > 0;
    if (csvRunning === apiRunning) counts.runningAgreement++;
    else {
      counts.runningDisagreement++;
      mismatches.push({ uid, type: str(row.type_name || row.type), csvStatus: str(row.productionStatus),
        csvRunning, apiProductionAction: apiRunning, observedAt: station.operations.observedAt ?? null,
        sourceRun: station.operations.sourceRun ?? null, actionTypes: Array.isArray(station.operations.actions) ?
          [...new Set(station.operations.actions.map(a => str(a?.attributes?.type)))].filter(Boolean) : [] });
    }
  }
  const apiTool = str(station.operations.tooledTo?.value ?? station.operations.tooledTo);
  if (csvTool && apiTool) {
    counts.toolingCompared++;
    if (normalize(csvTool) === normalize(apiTool)) counts.toolingMatches++;
    else { counts.toolingMismatches++; toolingMismatches.push({ uid, csvTool, apiTool }); }
  }
  if (!shipyard && csvRunning) nonShipyardProduction.push({ uid, type: str(row.type_name || row.type), csvStatus: str(row.productionStatus) });
}
counts.apiOnly = byUid.size - counts.matchedUids;
const report = { summary: { faction: snapshot.summary.ownerName, inventoryCompletedAt: snapshot.summary.sourceInventoryCompletedAt ?? snapshot.summary.completedAt,
  collectionCompletedAt: snapshot.summary.completedAt, detailSelection: snapshot.summary.detailSelection,
  caveat: 'Observations may predate snapshot completion. CSV export timestamp must be verified separately.' },
  counts, mismatches, nonShipyardProduction, nonShipyardTooling, toolingMismatches };
if (outputArg) await writeFile(resolve(outputArg), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ ...report.summary, counts, mismatchObservationDates: Object.fromEntries(
  [...new Set(mismatches.map(x => str(x.observedAt).slice(0, 10) || 'unknown'))].map(date => [date, mismatches.filter(x => str(x.observedAt).slice(0, 10) === date).length])),
  nonShipyardProductionCount: nonShipyardProduction.length, nonShipyardToolingCount: nonShipyardTooling.length,
  reportFile: outputArg ? resolve(outputArg) : null,
  note: outputArg ? 'UID-level details written locally; not printed.' : 'Pass a third path to save UID-level details locally.' }, null, 2));
