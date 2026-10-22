import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite } from '../src/storage/files.js';
import { SnapshotRun } from '../src/storage/snapshots.js';
import { stationOperations, enrichFactionStations } from '../src/swc/enrich-stations.js';
import { MATERIAL_FACTIONS } from '../src/swc/sync.js';

test('production details retain design, workers and timers without inventing idle status', () => {
  const action = { attributes: { type: 'EntityProductionAction' }, value: { status: 'running', workers: 10, delay: { remaining: 120, total: 240 } } };
  const queue = { entity: { value: 'Test design', attributes: { uid: 'type:1' } }, status: 'running' };
  const result = stationOperations({ actions: { action: [action] }, queueitems: { queueitem: [queue] }, tooledto: { value: 'Test design' } });
  assert.deepEqual(result.productionActions, [action]); assert.deepEqual(result.queueItems, [queue]);
  assert.equal(stationOperations({}).productionActions, null);
  assert.deepEqual(stationOperations({ actions: { action: [] } }).productionActions, []);
  assert.equal(stationOperations({ tooledto: { value: 'Test design' } }).productionActions, null);
});
test('station enrichment resumes completed details and writes only a complete scoped export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'swc-enrich-'));
  try {
    const location = { system: { uid: '9:104', name: 'Kashyyyk' } };
    await atomicWrite(join(root, 'normalized', 'source.json'), JSON.stringify({ summary: {
      entityType: 'stations', ownerUid: '20:102', ownerName: MATERIAL_FACTIONS.tjo, runId: 'source', completedAt: '2026-01-01T00:00:00Z'
    }, stations: [{ uid: '5:1', location }, { uid: '5:2', location }, { uid: '5:3', location: {} }] }));
    let fail = true; const calls: string[] = [];
    const client = {
      resolveLocation: async () => ({ kind: 'system' as const, name: 'Kashyyyk', uid: '9:104' }),
      stationDetail: async (uid: string) => {
        calls.push(uid); if (uid === '5:2' && fail) throw new Error('simulated interruption');
        return { uid, owner: { attributes: { uid: '20:102' } }, location: { system: { attributes: { uid: '9:104' } } }, actions: { action: [] } };
      }
    };
    const args = { kind: 'system' as const, name: 'Kashyyyk' };
    const first = new SnapshotRun(root);
    await assert.rejects(enrichFactionStations(client, first, root, 'tjo', args, async () => {}, () => {}), /interruption/);
    await assert.rejects(readFile(join(first.directory, 'complete.json')));
    fail = false;
    const summary = await enrichFactionStations(client, new SnapshotRun(root), root, 'tjo', args, async () => {}, () => {});
    assert.deepEqual(calls, ['5:1', '5:2', '5:2']); assert.equal(summary.ownedStations, 2);
    const saved = JSON.parse(await readFile(summary.exportFile, 'utf8'));
    assert.equal(saved.stations.length, 2); assert.ok(saved.stations[0].operations.observedAt);
    assert.match(summary.exportFile, /stations-production__system-kashyyyk/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
