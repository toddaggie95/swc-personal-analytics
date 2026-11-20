import {isDeepStrictEqual} from 'node:util';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {encrypt} from '../api-parity/private-audit-envelope.mjs';
import {createMineRead} from './discover.mjs';

export function compareFields(left, right, path = '$') {
  if (isDeepStrictEqual(left, right)) return [];
  const container = value => value !== null && typeof value === 'object';
  if (container(left) && container(right) && Array.isArray(left) === Array.isArray(right)) {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(key =>
      compareFields(left[key], right[key], path + '[' + JSON.stringify(key) + ']'));
  }
  return [{path, suspect: left, runningControl: right, suspectPresent: left !== undefined, controlPresent: right !== undefined}];
}

function describe(entity) {
  const deposits = entity.deposits?.deposit;
  const actions = entity.actions?.action;
  const volumes = entity.cargo?.volumecapacity;
  return {
    depositsPresent: Object.hasOwn(entity, 'deposits'),
    depositEntries: Array.isArray(deposits) ? deposits.length : null,
    depositQuantities: Array.isArray(deposits) ? deposits.map(row => {
      const q = row?.attributes?.quantity;
      return q === 0 ? 'zero' : typeof q === 'number' && q > 0 ? 'positive' : 'unknown';
    }) : [],
    actionEntries: Array.isArray(actions) ? actions.length : null,
    runningMining: Array.isArray(actions) && actions.some(row =>
      [row?.attributes?.type, row?.value?.actiontype].some(v => ['mine','mining'].includes(String(v).toLowerCase())) &&
      ['running','active','in progress','mining'].includes(String(row?.value?.status).toLowerCase())),
    freeMineVolume: volumes?.remaining === 0 ? 'zero' : typeof volumes?.remaining === 'number' && volumes.remaining > 0 ? 'positive' : 'unknown',
  };
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const ids = [event.inputs?.mine_uid, event.inputs?.compare_mine_uid].map(value => value?.trim());
  if (ids.some(id => !/^4:\d+$/.test(id ?? '')) || ids[0] === ids[1]) throw Error('Enter two distinct facility UIDs.');
  for (const id of ids) console.log('::add-mask::' + id);
  const temp = process.env.RUNNER_TEMP;
  const {accessToken, expiresAt} = JSON.parse(readFileSync(join(temp, 'swc-mine-private', 'tokens.json'), 'utf8'));
  const read = await createMineRead(accessToken, Math.min(expiresAt - 10_000, Date.now() + 120_000));
  const entities = [];
  for (const id of ids) {
    const response = await read.get('inventory/facilities/' + id + '/');
    if (!response.ok) throw Error('Facility detail GET returned HTTP ' + response.status);
    const body = await response.json();
    const entity = body.swcapi?.entity?.value ?? body.swcapi?.entity;
    if (entity?.uid !== id || entity.type?.attributes?.uid !== '4:36' ||
        entity.location?.system?.attributes?.uid !== '9:104') throw Error('API response did not identify the requested Kashyyyk mine.');
    entities.push(entity);
  }
  const [suspect, runningControl] = entities;
  const differences = compareFields(suspect, runningControl);
  const signal = {suspect: describe(suspect), runningControl: describe(runningControl), differingPaths: differences.length};
  const payload = {observedAt: new Date().toISOString(), suspect, runningControl, differences, signal};
  const key = readFileSync(new URL('../planet-api/snapshot-analysis-public-key.pem', import.meta.url));
  writeFileSync(join(temp, 'mine-field-comparison.encrypted.json'),
    JSON.stringify(encrypt(Buffer.from(JSON.stringify(payload)), key)), {mode: 0o600, flag: 'wx'});
  console.log(JSON.stringify(signal));
  if (!signal.runningControl.runningMining) console.log('The control mine was not running at read time.');
}
if (process.env.GITHUB_ACTIONS === 'true') {
  main().catch(error => {
    const message = error.message;
    console.error(/^(Enter two distinct facility UIDs\.|Facility detail GET returned HTTP \d+|API response did not identify|SWC quota|SWC rate|SWC GET)/.test(message)
      ? message : 'Comparison failed; private error details suppressed.');
    process.exitCode = 1;
  });
}
