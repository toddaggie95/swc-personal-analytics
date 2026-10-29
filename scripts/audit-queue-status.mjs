import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Offline-only audit. Report actual queue status vocabulary, not inferred production state.
const [csvArg, snapshotArg, outputArg] = process.argv.slice(2);
if (!csvArg || !snapshotArg) throw new Error('Usage: node scripts/audit-queue-status.mjs <stations.csv> <normalized-snapshot.json> [report.json]');
function parseCsv(input) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = ''; if (row.some(Boolean)) rows.push(row); row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('Unterminated CSV quote.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...values] = rows;
  if (!headers) throw new Error('Empty CSV.');
  return values.map(v => Object.fromEntries(headers.map((h, i) => [h.replace(/^\uFEFF/, ''), v[i] ?? ''])));
}
const [csv, snapshot] = await Promise.all([readFile(resolve(csvArg), 'utf8').then(parseCsv), readFile(resolve(snapshotArg), 'utf8').then(JSON.parse)]);
if (!Array.isArray(snapshot.stations)) throw new Error('Invalid station snapshot.');
const byUid = new Map(snapshot.stations.map(s => [String(s.uid), s]));
const statuses = {}, combinations = {}, examples = [];
let withQueue = 0, withStatus = 0, withoutStatus = 0;
for (const row of csv) {
  const s = byUid.get(String(row.uid).trim());
  if (!s || !Array.isArray(s.operations?.queueItems) || !s.operations.queueItems.length) continue;
  withQueue++;
  const csvStatus = String(row.productionStatus ?? '').trim().toLowerCase() || '(blank)';
  const stationStatuses = new Set();
  for (const q of s.operations.queueItems) {
    const v = q?.status;
    const raw = v === null || v === undefined ? '(missing)' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    statuses[raw] = (statuses[raw] ?? 0) + 1;
    stationStatuses.add(raw);
    if (raw === '(missing)') withoutStatus++; else withStatus++;
  }
  const signature = [...stationStatuses].sort().join(' | ');
  const key = JSON.stringify([csvStatus, signature]);
  combinations[key] = (combinations[key] ?? 0) + 1;
  if (examples.length < 25) examples.push({ uid: s.uid, csvStatus, queueStatuses: [...stationStatuses], observedAt: s.operations.observedAt ?? null, productionActionCount: Array.isArray(s.operations.productionActions) ? s.operations.productionActions.length : null });
}
const matrix = Object.entries(combinations).map(([key, count]) => { const [csvStatus, queueStatuses] = JSON.parse(key); return { csvStatus, queueStatuses, stations: count }; }).sort((a,b) => b.stations-a.stations);
const report = { summary: { stationsWithNonemptyQueue: withQueue, queueItemsWithStatus: withStatus, queueItemsWithoutStatus: withoutStatus, queueStatusValues: statuses, matrix, warning: 'Observed queue statuses are not assumed to indicate active production. Check CSV timestamp and observation dates.' }, examples };
if (outputArg) await writeFile(resolve(outputArg), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(report.summary, null, 2));
