import { config as dotenv } from 'dotenv';
import { join } from 'node:path';
import { loadConfig, requireLive, SafeError } from '../config/index.js';
import { loadAuth } from '../auth/session.js';
import { withLock, atomicWrite } from '../storage/files.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { ReadClient, facilityFilter, record } from '../swc/read-client.js';
import { normalizeEntity } from '../models/station.js';
import { MATERIAL_FACTIONS } from '../swc/sync.js';
import { safeFailure } from '../config/errors.js';

dotenv({ quiet: true });
// One owner inventory page maximum, plus character and location lookups.
async function main() {
  const [faction, ...args] = process.argv.slice(2);
  if (faction !== 'tff' && faction !== 'tjo') throw new SafeError('Specify tff or tjo.');
  const filter = facilityFilter(args);
  const config = loadConfig();
  requireLive(config);
  await withLock(config.privateDir, async () => {
    const run = new SnapshotRun(config.privateDir, 'material_probe');
    const client = new ReadClient(await loadAuth(config), run);
    const started = Date.now();
    const me = await client.me();
    const refs = Array.isArray(me.factions) ? me.factions.map(record) : [];
    const matches = refs.filter(ref => ref.value === MATERIAL_FACTIONS[faction]);
    const ownerUid = record(matches[0]?.attributes).uid;
    if (matches.length !== 1 || typeof ownerUid !== 'string' || !/^20:\d+$/.test(ownerUid)) throw new SafeError('Faction identity could not be verified.');
    const location = await client.resolveLocation(filter);
    const response = await client.factionMaterials(ownerUid, 1, location);
    const entities = record(response.entities);
    const attrs = record(entities.attributes);
    const rows = entities.entity;
    const integer = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && String(v).trim() ? Number(v) : NaN;
    const total = integer(attrs.total);
    const start = integer(attrs.start);
    const count = attrs.count == null && Array.isArray(rows) ? rows.length : integer(attrs.count);
    if (!Array.isArray(rows) || ![total, start, count].every(Number.isSafeInteger) || total < 0 || start !== 1 || count !== rows.length || count > 200 || total < count) throw new SafeError('Invalid pagination response. Raw data retained.');
    const lots = rows.map(row => normalizeEntity(row, ownerUid, run.id, 'materials'));
    if (new Set(lots.map(lot => lot.uid)).size !== lots.length) throw new SafeError('Duplicate material UID in sample.');
    if (lots.some(lot => lot.location[location.kind]?.uid !== location.uid)) throw new SafeError('Location filter not honored; raw data retained.');
    const summary = { status: 'sample-only', faction, ownerUid, location, totalReported: total, sampledLots: count, estimatedPages: Math.ceil(total / 200), requests: 3, elapsedSeconds: Math.round((Date.now() - started) / 1000), complete: total === count, caveat: 'First page only. No HAS totals or spreadsheet writes.' };
    const outputFile = join(config.privateDir, 'normalized', 'material_probe__' + faction + '__' + run.id + '.json');
    await atomicWrite(outputFile, JSON.stringify({ summary, lots }, null, 2));
    await run.complete({ ...summary, outputFile, rawDirectory: run.directory });
    console.log(JSON.stringify({ ...summary, outputFile }, null, 2));
  });
}
main().catch(error => { console.error(safeFailure(error, 'bounded material sample')); process.exitCode = 1; });
