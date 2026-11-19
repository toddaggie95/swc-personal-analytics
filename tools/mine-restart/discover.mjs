import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import {csv, MATERIALS} from '../production-sync/production-sync.mjs';

const SYSTEM_UID = '9:104';
const MINE_TYPE_UID = '4:36';
const API = 'https://www.swcombine.com/ws/v2.0/';
const DEFAULT_MATERIALS = 'quantum meleenium ardanium rudic duracrete rockivory tibannagas nova varium varmigio lommite durelium'.split(' ');
const uid = ref => ref?.attributes?.uid;
const norm = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const integer = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const hold = /\b(?:do\s+not|don['’]?t|never)[\s_-]+(?:restart|resume|min[eE]|start)\b|\b(?:hold|reserved|offline|leave\s+(?:off|paused)|no\s+(?:mining|restart|resume))\b/i;

function classify(facility, evidence, allowed, live) {
  const excluded = [], review = [];
  const {uid: id, name, location, infotext, tags, ispowered, underconstruction, wrecked} = facility;
  if (norm(ispowered) === 'no') excluded.push('unpowered');
  if (norm(underconstruction) === 'yes') excluded.push('under-construction');
  if (norm(wrecked) === 'yes') excluded.push('wrecked');
  if (norm(ispowered) !== 'yes' && norm(ispowered) !== 'no') review.push('power-unverified');
  if (![underconstruction, wrecked].every(value => ['yes', 'no'].includes(norm(value)))) review.push('facility-condition-unverified');

  const tagValues = tags?.tag;
  const texts = [infotext, evidence?.notes, ...(Array.isArray(tagValues) ? tagValues.map(tag => tag?.value ?? tag) : [])];
  if ([name, ...texts].some(value => hold.test(norm(value).replace(/[_-]+/g, ' ')))) excluded.push('explicit-hold-notation');
  else if (texts.some(value => norm(value)) || tagValues?.length) review.push('annotation-needs-review');
  if (typeof infotext !== 'string' || !Array.isArray(tagValues) || norm(evidence?.notations_checked) !== 'yes') {
    review.push('notations-not-fully-verified');
  }

  // Inventory activity filters and operator assignments do not prove mining is paused.
  const state = norm(evidence?.mining_status);
  if (['active', 'idle', 'stopped', 'depleted'].includes(state)) excluded.push('mining-not-paused');
  else if (state !== 'paused') review.push('paused-mining-unverified');

  const resource = norm(evidence?.deposit_material);
  if (!MATERIALS.includes(resource)) review.push('deposit-material-unverified');
  else if (!allowed.includes(resource)) excluded.push('resource-outside-allowlist');

  // Headroom is measured in units of this material across valid mining destinations.
  const remaining = integer(evidence?.deposit_remaining_units);
  const room = integer(evidence?.available_storage_units);
  const needed = integer(evidence?.required_storage_units);
  if (remaining === 0) excluded.push('deposit-depleted');
  else if (remaining === null) review.push('remaining-deposit-unverified');
  if (room === 0 || (room !== null && needed > 0 && room < needed)) excluded.push('insufficient-storage');
  else if (room === null || !(needed > 0)) review.push('storage-headroom-unverified');

  const age = Date.now() - Date.parse(evidence?.observed_at);
  if (!live) review.push('historical-inventory');
  if (!(age >= 0 && age <= 2 * 60 * 60 * 1000) || !norm(evidence?.source)) review.push('operational-evidence-missing-or-stale');
  return {
    uid: id, name, ownerUid: uid(facility.owner), planet: location.planet?.value, city: location.city?.value,
    classification: excluded.length ? 'excluded' : review.length ? 'manual-review' : 'eligible',
    reasons: [...excluded, ...review],
    evidence: {infotext, tags: tagValues, miningStatus: state || null, depositMaterial: resource || null,
      depositRemainingUnits: remaining, availableStorageUnits: room, requiredStorageUnits: needed,
      observedAt: evidence?.observed_at ?? null, source: evidence?.source ?? null},
  };
}

async function liveInventory(owners) {
  const token = process.env.SWC_ACCESS_TOKEN?.trim();
  if (!token) throw Error('SWC_ACCESS_TOKEN is required for live reads.');
  const rows = [], coverage = [];
  for (const owner of owners) {
    if (!/^(?:1|20):\d+$/.test(owner)) throw Error('Invalid inventory owner UID.');
    const seen = new Set();
    let expected;
    for (let start = 1, page = 0; ; page++) {
      if (page >= 100) throw Error('Facility inventory page limit reached.');
      if (page || coverage.length) await new Promise(resolve => setTimeout(resolve, 6500));
      const url = new URL(`inventory/${owner}/facilities/owner/`, API);
      url.search = new URLSearchParams({
        start_index: start, item_count: 200,
        'filter_type[0]': 'system', 'filter_value[0]': SYSTEM_UID, 'filter_inclusion[0]': 'includes',
        'filter_type[1]': 'type', 'filter_value[1]': MINE_TYPE_UID, 'filter_inclusion[1]': 'includes',
      });
      const response = await fetch(url, {method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: {Accept: 'application/json', Authorization: `OAuth ${token}`}});
      if (!response.ok) throw Error(`Facility inventory read returned HTTP ${response.status} for ${owner}.`);
      const {entities} = (await response.json()).swcapi ?? {};
      const attrs = entities?.attributes;
      const total = integer(attrs?.total);
      const pageRows = entities?.entity ?? (total === 0 ? [] : null);
      if (!Array.isArray(pageRows) || total === null || integer(attrs.start) !== start || pageRows.length > 200 ||
          (attrs.count != null && integer(attrs.count) !== pageRows.length) ||
          (expected !== undefined && expected !== total) || start - 1 + pageRows.length > total ||
          (total > 0 && !pageRows.length)) throw Error('Inconsistent facility inventory pagination.');
      expected = total;
      for (const item of pageRows) {
        const row = item.value ?? item;
        if (uid(row.owner) !== owner || uid(row.location?.system) !== SYSTEM_UID ||
            uid(row.type) !== MINE_TYPE_UID || !/^4:\d+$/.test(row.uid) || seen.has(row.uid)) {
          throw Error('Invalid or repeated facility in filtered inventory.');
        }
        rows.push(row);
        seen.add(row.uid);
      }
      if (seen.size === total) break;
      start += pageRows.length;
    }
    coverage.push({ownerUid: owner, status: 'complete', scope: 'system owner inventory', mines: seen.size});
  }
  return {rows, coverage};
}

function savedInventory(paths) {
  const rows = [], coverage = [];
  for (const path of paths) {
    const bytes = readFileSync(path);
    const snapshot = JSON.parse((path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'));
    if (!/^8:\d+$/.test(snapshot.planet?.uid) || !Number.isFinite(Date.parse(snapshot.createdAt))) {
      throw Error('Invalid planet capture metadata.');
    }
    for (const inventory of snapshot.inventories.filter(item => item.kind === 'facilities')) {
      const {ownerUid, status, total} = inventory;
      if (!['complete', 'unavailable'].includes(status) || !Array.isArray(inventory.rows) ||
          (status === 'complete' ? total !== inventory.rows.length : inventory.rows.length !== 0)) {
        throw Error('Incomplete or malformed saved facility inventory.');
      }
      const mines = inventory.rows.filter(row => uid(row.type) === MINE_TYPE_UID);
      for (const row of mines) {
        if (uid(row.owner) !== ownerUid || uid(row.location?.planet) !== snapshot.planet.uid ||
            uid(row.location?.system) !== SYSTEM_UID || !/^4:\d+$/.test(row.uid)) {
          throw Error('Saved mine identity or location mismatch.');
        }
        rows.push(row);
      }
      coverage.push({ownerUid, status, planet: snapshot.planet.name, capturedAt: snapshot.createdAt,
        mines: status === 'complete' ? mines.length : null});
    }
  }
  return {rows, coverage};
}

async function main() {
  const {values} = parseArgs({options: {
    owner: {type: 'string', multiple: true}, snapshot: {type: 'string', multiple: true},
    evidence: {type: 'string'}, materials: {type: 'string'}, output: {type: 'string'},
  }});
  if (Boolean(values.owner) === Boolean(values.snapshot) || !values.output) {
    throw Error('Supply either --owner UID (repeatable) or --snapshot PATH (repeatable), and --output PATH.');
  }
  const allowed = values.materials === undefined ? DEFAULT_MATERIALS : values.materials.split(',').map(norm);
  if (allowed.some(material => !MATERIALS.includes(material)) || new Set(allowed).size !== allowed.length) {
    throw Error('Invalid or duplicated material in allowlist.');
  }
  const evidence = new Map();
  if (values.evidence) {
    for (const row of csv(readFileSync(values.evidence, 'utf8'))) {
      const id = row.uid?.trim();
      if (!/^4:\d+$/.test(id) || evidence.has(id)) throw Error('Invalid or duplicate facility UID in evidence CSV.');
      evidence.set(id, row);
    }
  }
  const live = Boolean(values.owner);
  const {rows, coverage} = live ? await liveInventory([...new Set(values.owner)]) : savedInventory(values.snapshot);
  const report = {system: 'Kashyyyk', systemUid: SYSTEM_UID, mode: live ? 'live-get' : 'historical-capture',
    generatedAt: new Date().toISOString(), allowlist: allowed, coverage,
    counts: {eligible: 0, excluded: 0, 'manual-review': 0}, mines: []};
  const seen = new Set();
  for (const row of rows.sort((a, b) => a.uid.localeCompare(b.uid, 'en', {numeric: true}))) {
    if (seen.has(row.uid)) throw Error('Mine UID appeared more than once in inventory.');
    seen.add(row.uid);
    const mine = classify(row, evidence.get(row.uid), allowed, live);
    report.counts[mine.classification]++;
    report.mines.push(mine);
  }
  report.unmatchedEvidenceUids = [...evidence.keys()].filter(id => !seen.has(id));
  writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify(report.counts));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
