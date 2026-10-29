import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Offline structural diagnostics only. Never infer that queue entries mean active production.
const [snapshotArg, auditArg, outputArg] = process.argv.slice(2);
if (!snapshotArg || !auditArg) throw new Error('Usage: node scripts/inspect-station-queues.mjs <normalized-stations.json> <audit.json> [report.json]');
const [snapshot, audit] = await Promise.all([snapshotArg, auditArg].map(async p => JSON.parse(await readFile(resolve(p), 'utf8'))));
if (!Array.isArray(snapshot.stations) || !Array.isArray(audit.unknownProduction) || !Array.isArray(audit.mismatches)) throw new Error('Invalid station snapshot or audit report.');
const unknownUids = new Set(audit.unknownProduction.map(x => x.uid));
const mismatchUids = new Set(audit.mismatches.map(x => x.uid));
const samples = [];
const counts = { unknownWithNonemptyQueue: 0, unknownWithEmptyQueue: 0, unknownWithoutQueueArray: 0, mismatchWithNonemptyQueue: 0, mismatchWithoutNonemptyQueue: 0 };
const queueKeys = {}, queueTypes = {};
const scrub = value => {
  if (Array.isArray(value)) return value.slice(0, 3).map(scrub);
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, scrub(v)]));
};
for (const station of snapshot.stations) {
  const uid = station.uid, o = station.operations ?? {}, queue = o.queueItems;
  const unknown = unknownUids.has(uid), mismatch = mismatchUids.has(uid);
  if (!unknown && !mismatch) continue;
  if (unknown) {
    if (!Array.isArray(queue)) counts.unknownWithoutQueueArray++;
    else if (!queue.length) counts.unknownWithEmptyQueue++;
    else counts.unknownWithNonemptyQueue++;
  }
  if (mismatch) {
    if (Array.isArray(queue) && queue.length) counts.mismatchWithNonemptyQueue++;
    else counts.mismatchWithoutNonemptyQueue++;
  }
  if (Array.isArray(queue)) for (const item of queue) {
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item)) queueKeys[key] = (queueKeys[key] ?? 0) + 1;
      const type = String(item?.attributes?.type ?? item?.type ?? '(not specified)');
      queueTypes[type] = (queueTypes[type] ?? 0) + 1;
    }
  }
  if (samples.length < 16 && (mismatch || (unknown && Array.isArray(queue) && queue.length))) {
    samples.push({ uid, category: mismatch ? 'disagreement' : 'unknown', observedAt: o.observedAt ?? null, queueCount: Array.isArray(queue) ? queue.length : null, queueShape: Array.isArray(queue) && queue.length ? scrub(queue[0]) : null, actionsPresent: Array.isArray(o.actions) });
  }
}
const report = { summary: { counts, queueKeys, queueTypes, caveat: 'Queue item presence does not prove active production. Shape samples describe field types, not sensitive values.' }, samples };
if (outputArg) await writeFile(resolve(outputArg), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(report.summary, null, 2));
