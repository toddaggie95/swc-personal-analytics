import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Offline only: explain missing action data and distinguish transitions from genuine agreements.
const [beforeArg, afterArg, beforeAuditArg, afterAuditArg, outputArg] = process.argv.slice(2);
if (![beforeArg, afterArg, beforeAuditArg, afterAuditArg].every(Boolean)) throw new Error('Usage: node scripts/diagnose-station-production.mjs <before-snapshot.json> <after-snapshot.json> <before-audit.json> <after-audit.json> [local-report.json]');
const load = async p => JSON.parse(await readFile(resolve(p), 'utf8'));
const [before, after, prior, current] = await Promise.all([beforeArg, afterArg, beforeAuditArg, afterAuditArg].map(load));
if (!Array.isArray(before.stations) || !Array.isArray(after.stations) || !Array.isArray(prior.mismatches) || !Array.isArray(current.mismatches)) throw new Error('Invalid snapshot or audit data.');
const first = new Map(before.stations.map(s => [s.uid, s]));
const last = new Map(after.stations.map(s => [s.uid, s]));
const state = s => {
  if (!s?.operations || s.operations.status === 'not-checked') return 'not-checked';
  const ops = s.operations;
  const actions = Array.isArray(ops.productionActions) ? ops.productionActions : Array.isArray(ops.actions) ? ops.actions.filter(a => a?.attributes?.type === 'EntityProductionAction') : null;
  return actions === null ? 'unknown' : actions.length ? 'running' : 'not-running';
};
const transitions = {};
const details = [];
const previousIssues = new Set([...prior.mismatches.map(s => s.uid), ...(prior.unknownProduction ?? []).filter(s => String(s.csvStatus).toLowerCase() === 'running').map(s => s.uid)]);
for (const uid of previousIssues) {
  const a = first.get(uid), b = last.get(uid);
  if (!a || !b) throw new Error('Missing UID in snapshot: ' + uid);
  const oldState = state(a), newState = state(b), transition = oldState + ' -> ' + newState;
  transitions[transition] = (transitions[transition] ?? 0) + 1;
  details.push({ uid, transition, beforeObservedAt: a.operations?.observedAt ?? null, afterObservedAt: b.operations?.observedAt ?? null, csvStatus: (prior.mismatches.find(x => x.uid === uid) ?? prior.unknownProduction?.find(x => x.uid === uid))?.csvStatus ?? null });
}
const mismatches = current.mismatches.map(m => ({ uid: m.uid, csvStatus: m.csvStatus, csvRunning: m.csvRunning, apiProductionAction: m.apiProductionAction, observedAt: m.observedAt, actionTypes: m.actionTypes }));
const unknown = after.stations.filter(s => state(s) === 'unknown');
const fieldPresence = { actionsNull: 0, actionsArray: 0, productionActionsNull: 0, productionActionsArray: 0, queueItemsNull: 0, queueItemsArray: 0, unknownWithQueueItems: 0 };
for (const s of after.stations) {
  if (!s.operations || s.operations.status === 'not-checked') continue;
  const o = s.operations;
  fieldPresence[Array.isArray(o.actions) ? 'actionsArray' : 'actionsNull']++;
  fieldPresence[Array.isArray(o.productionActions) ? 'productionActionsArray' : 'productionActionsNull']++;
  fieldPresence[Array.isArray(o.queueItems) ? 'queueItemsArray' : 'queueItemsNull']++;
  if (state(s) === 'unknown' && Array.isArray(o.queueItems) && o.queueItems.length) fieldPresence.unknownWithQueueItems++;
}
const report = { summary: { targeted: previousIssues.size, transitions, remainingDisagreements: mismatches.length, unknown: unknown.length, fieldPresence, warning: 'Absent actions remain unknown, not confirmed idle. CSV and snapshot timestamps may differ.' }, mismatches, targetedDetails: details, unknownSample: unknown.slice(0, 12).map(s => ({ uid: s.uid, observedAt: s.operations?.observedAt, hasQueueItems: Array.isArray(s.operations?.queueItems) && s.operations.queueItems.length > 0 })) };
if (outputArg) await writeFile(resolve(outputArg), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(report.summary, null, 2));
