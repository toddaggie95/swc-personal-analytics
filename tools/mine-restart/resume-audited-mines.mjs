import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {decrypt, encrypt} from '../api-parity/private-audit-envelope.mjs';
import {createMineRead, DEFAULT_MATERIALS} from './discover.mjs';
import {classifyMine, mineClassificationContract} from './audit-classifier.mjs';

const temp = process.env.RUNNER_TEMP;
const privateKey = process.env.SWC_API_SNAPSHOT_PRIVATE_KEY;
const output = join(temp, 'mine-resume-report.encrypted.json');
const key = readFileSync(new URL('../planet-api/snapshot-analysis-public-key.pem', import.meta.url));
const report = {successfullyRestarted: [], skipped: [], unconfirmed: []};
function save() {
  writeFileSync(output + '.tmp', JSON.stringify(encrypt(Buffer.from(JSON.stringify(report)), key)), {mode: 0o600});
  renameSync(output + '.tmp', output);
}
function summary() {
  return {confirmed: report.successfullyRestarted.length, skipped: report.skipped.length,
    unconfirmed: report.unconfirmed.length, pending: report.pending ?? 0, stopReason: report.stopReason};
}
async function main() {
  if (process.env.GITHUB_RUN_ATTEMPT !== '1') throw Error('A new workflow run is required.');
  const envelope = JSON.parse(readFileSync(join(temp, 'mine-resume-plan.encrypted.json'), 'utf8'));
  const plan = JSON.parse(decrypt(envelope, privateKey));
  if (plan.version !== 1 || plan.runId !== process.env.GITHUB_RUN_ID || plan.complete !== true ||
      plan.contract !== mineClassificationContract || !Array.isArray(plan.candidates) ||
      new Set(plan.candidates.map(c => c.uid)).size !== plan.candidates.length) throw Error('Invalid resume plan.');
  report.pending = plan.candidates.length;
  report.auditRunId = plan.runId;
  report.auditOperations = plan.operations;
  save();
  if (report.pending === 0) return;
  const estimate = plan.candidates.reduce((sum, row) => sum + row.expectedCost, 0);
  report.auditedExpectedCost = estimate;
  report.confirmedExpectedCost = 0;
  const saved = JSON.parse(process.env.SWC_MINE_PILOT_TOKENS_JSON || '{}');
  delete process.env.SWC_MINE_PILOT_TOKENS_JSON;
  if (typeof saved.accessToken !== 'string' || !saved.accessToken.trim() || !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt < Date.now() + 5 * 60_000) throw Error('Dedicated mine write credential is missing or near expiry.');
  const read = await createMineRead(saved.accessToken, Math.min(saved.expiresAt - 45_000, Date.now() + 12 * 60_000));
  const getMine = async target => {
    const response = await read.get('inventory/facilities/' + target.uid + '/');
    if (!response.ok) throw Error('Facility GET returned HTTP ' + response.status);
    const body = await response.json();
    const e = body.swcapi?.entity?.value ?? body.swcapi?.entity;
    if (e?.uid !== target.uid || e.type?.attributes?.uid !== '4:36' || e.owner?.attributes?.uid !== target.ownerUid ||
        e.location?.system?.attributes?.uid !== target.systemUid) throw Error('Facility identity or location changed.');
    return e;
  };
  for (const target of plan.candidates) {
    const age = Date.now() - Date.parse(target.observedAt);
    if (!/^4:\d+$/.test(target.uid) || !['20:1174','20:1838'].includes(target.ownerUid) ||
        !/^9:\d+$/.test(target.systemUid) || !(age >= 0 && age <= 30 * 60_000)) {
      throw Error('Resume plan contains a stale or invalid target.');
    }
  }
  for (const target of plan.candidates) {
    const entity = await getMine(target);
    const mine = {...classifyMine(target, entity, DEFAULT_MATERIALS), system: entity.location?.system?.value,
      systemUid: target.systemUid};
    if (mine.category !== 'paused-with-space-candidate' || mine.material !== target.material) {
      report.skipped.push({...mine, reasons: mine.reasons.length ? mine.reasons : ['Deposit material changed']});
      report.pending--;
      save();
      continue;
    }
    if (Date.now() + 95_000 >= saved.expiresAt) throw Error('Write credential is nearing expiry.');
    const actionId = entity.actions.action[0].attributes.id;
    const attempt = {...mine, actionId, attemptedAt: new Date().toISOString(), reason: 'Awaiting SWC response and readback'};
    report.unconfirmed.push(attempt);
    report.pending--;
    save();
    let accepted = false;
    await delay(1000);
    try {
      const response = await fetch('https://www.swcombine.com/ws/v2.0/inventory/facilities/' + mine.uid + '/action/', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000),
        headers: {Accept: 'application/json', Authorization: 'OAuth ' + saved.accessToken, 'Content-Type': 'application/json'},
        body: JSON.stringify({new_value: 'resume'}),
      });
      attempt.httpStatus = response.status;
      const result = (await response.json()).swcapi?.result?.data;
      accepted = response.ok && result?.succeeded?.entity?.length === 1 &&
        result.succeeded.entity[0]?.uid === mine.uid && result?.failed?.entity?.length === 0;
    } catch { /* A failed or ambiguous POST is never retried. */ }
    save();
    await delay(1000);
    const after = await getMine(target);
    const actions = after.actions?.action;
    const current = Array.isArray(actions) && actions.length === 1 ? actions[0] : null;
    const running = current?.attributes?.id === actionId &&
      ['running','active','in progress','mining'].includes(String(current.value?.status).trim().toLowerCase());
    if (!accepted || !running) {
      attempt.reason = accepted ? 'SWC accepted the request; the original action was not confirmed running' :
        'SWC resume response was unsuccessful or ambiguous';
      throw Error('A resume could not be confirmed. The batch stopped without a retry.');
    }
    report.confirmedExpectedCost += mine.expectedCost;
    report.unconfirmed.pop();
    report.successfullyRestarted.push({...mine, actionId, previousState: 'paused', verifiedState: 'running',
      httpStatus: attempt.httpStatus, verifiedAt: new Date().toISOString()});
    save();
  }
}
try {
  await main();
} catch (error) {
  const fixed = /^(A new workflow|Invalid resume plan|Dedicated mine|Resume plan|Facility GET|Facility identity|Write credential|A resume could)/;
  report.stopReason = fixed.test(error.message) ? error.message : 'Resume stopped on an API or workflow error.';
  process.exitCode = 1;
} finally {
  save();
  console.log(JSON.stringify(summary()));
}
