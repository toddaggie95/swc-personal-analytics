import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
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
    else if (ch === '\\n' || ch === '\\r') {
      if (ch === '\\r' && input[i + 1] === '\\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) table.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (cell || row.length) { row.push(cell); table.push(row); }
  const [headers, ...records] = table;
  if (!headers) throw new Error('Empty CSV.');
  return records.map(record => Object.fromEntries(headers.map((h, i) => [h.replace(/^\\uFEFF/, ''), record[i] ?? ''])));
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const rows = (v: unknown): Obj[] => Array.isArray(v) ? v.map(obj) : [];
const val = (v: unknown) => v == null ? '' : String(v).trim();
const key = (v: unknown) => val(v).toLowerCase();
const root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'SWC Personal Analytics') : '';
const csvPath = process.argv[2];
if (!root || !csvPath) throw new Error('Usage: npm run audit:stations -- "path-to-TFF-Stations.csv"');
const csv = parseCsv(await readFile(csvPath, 'utf8'));
const files = (await readdir(join(root, 'checkpoints'))).filter(f => f.startsWith('station-sync-') && f.endsWith('.json'));
const snapshots = await Promise.all(files.map(async f => obj(JSON.parse(await readFile(join(root, 'checkpoints', f), 'utf8')))));
const tff = snapshots.filter(s => val(obj(s.summary).ownerName) === 'The Faerytail Family')
  .sort((a,b) => val(obj(b.summary).completedAt).localeCompare(val(obj(a.summary).completedAt)))[0];
if (!tff) throw new Error('No TFF station inventory checkpoint found.');
const api = rows(tff.stations);
const csvIds = new Set(csv.map(r => val(r.uid)).filter(Boolean));
const apiIds = new Set(api.map(r => val(r.uid)).filter(Boolean));
const intersection = [...apiIds].filter(uid => csvIds.has(uid)).length;
const detailFiles = (await readdir(join(root, 'checkpoints'))).filter(f => f.startsWith('station-details-') && f.endsWith('.json'));
const detailCounts = [];
for (const file of detailFiles) {
  const d = obj(JSON.parse(await readFile(join(root, 'checkpoints', file), 'utf8')));
  const observations = Object.values(d).map(obj);
  detailCounts.push({ checkpoint: file.slice(16,24), observations: observations.length,
    sourceRuns: [...new Set(observations.map(o => val(o.sourceRun)))].length,
    actionsNonNull: observations.filter(o => o.actions != null).length,
    queueNonNull: observations.filter(o => o.queueItems != null).length,
    toolingNonNull: observations.filter(o => o.tooledTo != null).length });
}
const inventoryFields = [...new Set(api.flatMap(o => Object.keys(o)))].sort();
const csvFields = [...new Set(csv.flatMap(o => Object.keys(o)))].sort();
const csvShipyards = csv.filter(r => /shipyard/i.test(val(r.type_name || r.type))).length;
const csvRunning = csv.filter(r => key(r.productionStatus) === 'running').length;
const csvTooled = csv.filter(r => val(r['tooled-to']) !== '').length;
const summary = {
  comparison: 'read-only local snapshot audit; timestamps may differ',
  csv: { rows: csv.length, uniqueUids: csvIds.size, shipyards: csvShipyards, productionRunning: csvRunning, tooled: csvTooled },
  api: { rows: api.length, uniqueUids: apiIds.size, collectedAt: obj(tff.summary).completedAt },
  uidComparison: { matched: intersection, csvOnly: csvIds.size - intersection, apiOnly: apiIds.size - intersection },
  inventoryFields, csvFields, detailCounts,
  warning: 'A missing detail field is unknown, not proof of idle production. No inventory or station identities printed.'
};
console.log(JSON.stringify(summary, null, 2));
