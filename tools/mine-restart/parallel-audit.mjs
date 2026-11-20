import {createPublicKey} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {decrypt, encrypt} from '../api-parity/private-audit-envelope.mjs';
import {createMineRead, DEFAULT_MATERIALS, liveInventory, MineReadStop} from './discover.mjs';
import {classifyMine, mineClassificationContract, summarizeMineOperations, summarizeUnfamiliarInfotext} from './audit-classifier.mjs';
import {minePlanIdentity, restoreMineProgress} from './audit-progress.mjs';

const owners = ['20:1174', '20:1838'];
const batchSize = 250;
const temp = process.env.RUNNER_TEMP;
const privateKey = process.env.SWC_API_SNAPSHOT_PRIVATE_KEY;
const categories = ['depleted', 'reported-depleted', 'do-not-restart', 'paused-no-mine-space',
  'paused-with-space-candidate', 'already-running', 'other-excluded', 'manual-review'];

function open(path) {
  return JSON.parse(decrypt(JSON.parse(readFileSync(path, 'utf8')), privateKey));
}
function seal(path, payload, key = createPublicKey(privateKey)) {
  writeFileSync(path, JSON.stringify(encrypt(Buffer.from(JSON.stringify(payload)), key)), {mode: 0o600, flag: 'wx'});
}
function token(path) {
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof saved.accessToken !== 'string' || !saved.accessToken.trim() || !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt < Date.now() + 15 * 60_000) throw Error('Usable SWC access token is unavailable.');
  return saved;
}
function validatePlan(plan) {
  if (plan?.version !== 1 || plan.system !== 'All' || !Array.isArray(plan.mines) ||
      !Array.isArray(plan.batches) || !Array.isArray(plan.coverage) ||
      JSON.stringify(plan.allowlist) !== JSON.stringify(DEFAULT_MATERIALS) ||
      plan.identity !== minePlanIdentity('All', plan.mines, plan.allowlist, mineClassificationContract)) {
    throw Error('Invalid mine audit plan.');
  }
  restoreMineProgress({version: 1, identity: plan.identity, observedFrom: plan.observedFrom, entries: []},
    plan.identity, plan.mines);
  const ids = plan.mines.map(mine => mine.uid);
  const countMatches = owners.every(owner => plan.coverage.some(row => row.owner === owner &&
    row.status === 'inventory-complete' && row.count === plan.mines.filter(m => m.ownerUid === owner).length));
  if (!countMatches || plan.mines.some(m => !owners.includes(m.ownerUid) || !/^4:\d+$/.test(m.uid)) ||
      plan.batches.some((batch, i) => batch.id !== i + 1 || !Array.isArray(batch.uids) ||
        batch.uids.length < 1 || batch.uids.length > batchSize) ||
      JSON.stringify(plan.batches.flatMap(batch => batch.uids)) !== JSON.stringify(ids)) {
    throw Error('Mine plan does not account for every owner inventory row.');
  }
  return plan;
}
async function planAudit() {
  const started = Date.now();
  const saved = token(join(temp, 'swc-mine-private', 'tokens.json'));
  const read = await createMineRead(saved.accessToken, Math.min(saved.expiresAt - 10_000, started + 10 * 60_000));
  const {rows, coverage} = await liveInventory(owners, null, read);
  const mines = rows.map(row => ({uid: row.uid, ownerUid: row.owner?.attributes?.uid, name: row.name,
    systemUid: row.location?.system?.attributes?.uid ?? null, system: row.location?.system?.value ?? null}));
  const batches = [];
  for (let i = 0; i < mines.length; i += batchSize) {
    batches.push({id: batches.length + 1, uids: mines.slice(i, i + batchSize).map(mine => mine.uid)});
  }
  const plan = validatePlan({version: 1, system: 'All', observedFrom: new Date(started).toISOString(),
    allowlist: DEFAULT_MATERIALS, identity: minePlanIdentity('All', mines, DEFAULT_MATERIALS, mineClassificationContract),
    mines, batches, coverage: coverage.map(c => ({owner: c.ownerUid, status: 'inventory-complete', count: c.mines})),
    inventoryMetrics: {...read.summary(), elapsedMs: Date.now() - started}});
  seal(join(temp, 'parallel-mine-plan.encrypted.json'), plan);
  const {appendFileSync} = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, 'matrix=' + JSON.stringify({batch: batches.map(batch => batch.id)}) +
    '\nhas_batches=' + String(batches.length > 0) + '\n');
  console.log(JSON.stringify({phase: 'plan', mines: mines.length, batches: batches.length, ...plan.inventoryMetrics}));
}
async function collectBatch() {
  const started = Date.now();
  const plan = validatePlan(open(join(temp, 'parallel-mine-plan.encrypted.json')));
  const batch = plan.batches.find(b => b.id === Number(process.env.MINE_BATCH));
  if (!batch) throw Error('Unknown mine batch.');
  const saved = token(join(temp, 'mine-worker-access.json'));
  if (saved.refreshToken) throw Error('Mine workers require an access-only credential.');
  const read = await createMineRead(saved.accessToken, Math.min(saved.expiresAt - 60_000, started + 12 * 60_000));
  const targets = new Map(plan.mines.map(row => [row.uid, row]));
  const results = [];
  let stopReason;
  for (const uid of batch.uids) {
    const mine = targets.get(uid);
    if (!stopReason) {
      try {
        const response = await read.get('inventory/facilities/' + uid + '/');
        if (!response.ok) throw Error('detail HTTP ' + response.status);
        const body = await response.json();
        const e = body.swcapi?.entity?.value ?? body.swcapi?.entity;
        if (e?.uid !== uid || e.owner?.attributes?.uid !== mine.ownerUid || e.type?.attributes?.uid !== '4:36' ||
            (e.location?.system?.attributes?.uid ?? null) !== mine.systemUid) throw Error('detail identity mismatch');
        const row = {...classifyMine(mine, e, plan.allowlist), systemUid: mine.systemUid, system: mine.system,
          observedAt: new Date().toISOString()};
        if (!mine.systemUid && row.classification === 'candidate') {
          row.classification = 'manual-review';
          row.category = 'manual-review';
          row.reasons.push('system location unverified');
        }
        results.push(row);
        continue;
      } catch (error) {
        if (error instanceof MineReadStop) stopReason = error.message;
        const reason = stopReason ?? (/^(detail HTTP \d{3}|detail identity mismatch)$/.test(error.message)
          ? error.message : 'detail request unavailable');
        results.push({...mine, classification: 'manual-review', category: 'manual-review',
          detailsUnavailable: true, reasons: [reason]});
        continue;
      }
    }
    results.push({...mine, classification: 'manual-review', category: 'manual-review',
      detailsUnavailable: true, reasons: [stopReason]});
  }
  const metrics = {...read.summary(), startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started};
  seal(join(temp, 'mine-worker-' + batch.id + '.encrypted.json'),
    {identity: plan.identity, batch: batch.id, results, metrics});
  console.log(JSON.stringify({phase: 'details', batch: batch.id, checked: results.filter(r => !r.detailsUnavailable).length,
    pending: results.filter(r => r.detailsUnavailable).length, ...metrics}));
}
function assembleAudit() {
  const plan = validatePlan(open(join(temp, 'parallel-mine-plan.encrypted.json')));
  const workers = join(temp, 'mine-worker-results');
  const files = readdirSync(workers, {recursive: true}).filter(path => /(?:^|[/\\])mine-worker-\d+\.encrypted\.json$/.test(path));
  const batches = new Map(plan.batches.map(batch => [batch.id, batch]));
  const targets = new Map(plan.mines.map(mine => [mine.uid, mine]));
  const details = new Map(), seenBatches = new Set(), workerMetrics = [];
  for (const file of files) {
    const result = open(join(workers, file));
    const batch = batches.get(result.batch);
    if (!batch || seenBatches.has(result.batch) || result.identity !== plan.identity ||
        !Array.isArray(result.results) || JSON.stringify(result.results.map(r => r.uid)) !== JSON.stringify(batch.uids)) {
      throw Error('Missing, duplicate or mismatched mine worker rows.');
    }
    seenBatches.add(result.batch);
    workerMetrics.push({batch: result.batch, ...result.metrics});
    for (const row of result.results) {
      const target = targets.get(row.uid);
      if (!target || details.has(row.uid) || row.ownerUid !== target.ownerUid || row.systemUid !== target.systemUid ||
          !categories.includes(row.category)) throw Error('Invalid mine detail assignment.');
      details.set(row.uid, row);
    }
  }
  const mines = plan.mines.map(mine => details.get(mine.uid) ?? {...mine, classification: 'manual-review',
    category: 'manual-review', detailsUnavailable: true, reasons: ['detail worker result unavailable']});
  const entries = mines.filter(mine => !mine.detailsUnavailable);
  restoreMineProgress({version: 1, identity: plan.identity, observedFrom: plan.observedFrom, entries}, plan.identity, plan.mines);
  const complete = entries.length === mines.length;
  const counts = Object.fromEntries(categories.map(category => [category, mines.filter(m => m.category === category).length]));
  const key = readFileSync(new URL('../planet-api/snapshot-analysis-public-key.pem', import.meta.url));
  const unfamiliarInfotext = summarizeUnfamiliarInfotext(mines);
  const operations = summarizeMineOperations(mines);
  const operationalCounts = Object.fromEntries(Object.entries(operations).map(([key, rows]) => [key, rows.length]));
  const workerStarts = workerMetrics.map(m => Date.parse(m.startedAt)).filter(Number.isFinite);
  const workerEnds = workerMetrics.map(m => Date.parse(m.startedAt) + m.elapsedMs).filter(Number.isFinite);
  const elapsedMs = Date.now() - Date.parse(plan.observedFrom);
  const detailWallMs = workerStarts.length && workerEnds.length
    ? Math.max(...workerEnds) - Math.min(...workerStarts) : 0;
  const timing = {elapsedMs, inventoryWallMs: plan.inventoryMetrics.elapsedMs, detailWallMs,
    otherWallMs: Math.max(0, elapsedMs - plan.inventoryMetrics.elapsedMs - detailWallMs),
    apiRequests: plan.inventoryMetrics.requests + workerMetrics.reduce((sum, m) => sum + m.requests, 0)};
  const report = {system: 'All', timing, unfamiliarInfotext, operations, complete, coverage: plan.coverage, observedFrom: plan.observedFrom,
    observedTo: new Date().toISOString(), checkedDetails: entries.length, pendingDetails: mines.length - entries.length,
    resumedDetails: 0, allowlist: plan.allowlist, mines, categories: counts,
    readMetrics: {inventory: plan.inventoryMetrics, workers: workerMetrics}};
  seal(join(temp, 'system-mine-audit.encrypted.json'), report, key);
  if (!complete && entries.length) {
    seal(join(temp, 'mine-audit-progress.encrypted.json'),
      {version: 1, identity: plan.identity, observedFrom: plan.observedFrom, entries});
  }
  console.log(JSON.stringify({system: 'All', complete, checkedDetails: report.checkedDetails, pendingDetails: report.pendingDetails,
    categories: counts, operationalCounts, unfamiliarInfotextValues: unfamiliarInfotext.length,
    minesWithUnfamiliarInfotext: unfamiliarInfotext.reduce((sum, note) => sum + note.mines.length, 0), workersCompleted: seenBatches.size, workersPlanned: plan.batches.length,
    timing, inventory: plan.inventoryMetrics, workers: workerMetrics}));
}

const commands = {plan: planAudit, worker: collectBatch, assemble: assembleAudit};
try {
  if (!commands[process.argv[2]] || !privateKey || !temp) throw Error('Mine audit configuration unavailable.');
  await commands[process.argv[2]]();
} catch (error) {
  const safe = /^((Invalid|Missing|Mine plan|Unknown|Usable SWC|SWC quota|SWC rate|Mine workers|Mine checkpoint|Facility inventory|Inconsistent|Duplicate).*)$/;
  console.error(safe.test(error.message) ? error.message : 'Mine audit failed; private error details suppressed.');
  process.exitCode = 1;
}
