import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config as dotenv } from 'dotenv';
import { loadConfig, requireLive, SafeError } from '../config/index.js';
import { loadAuth } from '../auth/session.js';
import { withLock, atomicWrite } from '../storage/files.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { ReadClient, record } from '../swc/read-client.js';
import { stationOperations } from '../swc/enrich-stations.js';

dotenv({ quiet: true });
async function main() {
  const [snapshotArg, selectionArg] = process.argv.slice(2);
  if (!snapshotArg || !selectionArg || process.argv.length !== 4) throw new SafeError('Usage: npm run refresh:stations -- <normalized-snapshot.json> <selection.json>');
  const snapshot = JSON.parse(await readFile(resolve(snapshotArg), 'utf8'));
  const selection = JSON.parse(await readFile(resolve(selectionArg), 'utf8'));
  if (!Array.isArray(snapshot.stations) || !snapshot.summary || !Array.isArray(selection.stations)) throw new SafeError('Invalid snapshot or selection.');
  if (snapshot.summary.entityType !== 'stations' || !/^20:\d+$/.test(String(snapshot.summary.ownerUid))) throw new SafeError('Expected a faction station snapshot.');
  if (selection.stations.length === 0 || selection.stations.length > 100) throw new SafeError('Selection must contain 1-100 stations.');
  const ids = selection.stations.map((s: { uid: string }) => String(s.uid));
  if (new Set(ids).size !== ids.length || ids.some((uid: string) => !/^5:\d+$/.test(uid))) throw new SafeError('Duplicate or invalid selected UIDs.');
  const byUid = new Map(snapshot.stations.map((s: { uid: string }) => [String(s.uid), s]));
  if (ids.some((uid: string) => !byUid.has(uid))) throw new SafeError('Selected station not in source inventory.');
  const config = loadConfig(); requireLive(config);
  await withLock(config.privateDir, async () => {
    const run = new SnapshotRun(config.privateDir, 'targeted_station_refresh');
    const client = new ReadClient(await loadAuth(config), run);
    const start = Date.now(), refreshed = new Map<string, unknown>();
    for (const uid of ids) {
      const detail = await client.stationDetail(uid);
      if (detail.uid !== uid || record(record(detail.owner).attributes).uid !== snapshot.summary.ownerUid) throw new SafeError('Station identity or owner changed; refresh inventory before retry.');
      refreshed.set(uid, { ...byUid.get(uid) as object, operations: { ...stationOperations(detail), observedAt: new Date().toISOString(), sourceRun: run.id, rawDirectory: run.directory } });
      console.log('Refreshed ' + refreshed.size + '/' + ids.length);
    }
    const stations = snapshot.stations.map((s: { uid: string }) => refreshed.get(String(s.uid)) ?? s);
    const exportFile = join(config.privateDir, 'normalized', 'targeted_station_refresh__' + run.id + '.json');
    const summary = { ...snapshot.summary, runId: run.id, completedAt: new Date().toISOString(), sourceSnapshotRun: snapshot.summary.runId, enrichment: 'targeted-station-refresh', targetedRefreshed: refreshed.size, targetedRequested: ids.length, elapsedMs: Date.now() - start, requestCount: ids.length, exportFile, rawDirectory: run.directory, consistency: 'Selected station details freshly observed; all other station observations retained from source snapshot.' };
    await atomicWrite(exportFile, JSON.stringify({ summary, stations }, null, 2));
    await run.complete(summary);
    console.log(JSON.stringify({ status: 'complete', refreshed: refreshed.size, requests: ids.length, elapsedSeconds: Math.round((Date.now() - start) / 1000), exportFile }, null, 2));
  });
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : 'Targeted refresh failed.'); process.exitCode = 1; });
