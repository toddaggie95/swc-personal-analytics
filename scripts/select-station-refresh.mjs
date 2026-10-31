import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Offline selection: no API calls. Use the audit report's explicit UID-level findings.
const [auditPath, outputPath] = process.argv.slice(2);
if (!auditPath || !outputPath) throw new Error('Usage: node scripts/select-station-refresh.mjs <audit-report.json> <selection.json>');
const audit = JSON.parse(await readFile(resolve(auditPath), 'utf8'));
if (!Array.isArray(audit.mismatches) || !Array.isArray(audit.unknownProduction)) throw new Error('Invalid audit report.');
const selected = new Map();
for (const row of audit.mismatches) {
  if (!/^5:\d+$/.test(String(row.uid))) throw new Error('Invalid station UID in mismatches.');
  selected.set(row.uid, { uid: row.uid, reason: 'production-disagreement', observedAt: row.observedAt ?? null });
}
for (const row of audit.unknownProduction) {
  if (String(row.csvStatus).trim().toLowerCase() !== 'running') continue;
  if (!/^5:\d+$/.test(String(row.uid))) throw new Error('Invalid station UID in unknown production.');
  if (!selected.has(row.uid)) selected.set(row.uid, { uid: row.uid, reason: 'csv-running-api-unknown', observedAt: row.observedAt ?? null });
}
const selection = { schemaVersion: 1, sourceAudit: resolve(auditPath), createdAt: new Date().toISOString(), stations: [...selected.values()] };
await writeFile(resolve(outputPath), JSON.stringify(selection, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ selected: selection.stations.length, disagreements: audit.mismatches.length, csvRunningUnknown: selection.stations.filter(s => s.reason === 'csv-running-api-unknown').length, selectionFile: resolve(outputPath) }, null, 2));
