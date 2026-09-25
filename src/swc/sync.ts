import { join } from 'node:path';
import { SafeError } from '../config/index.js';
import { atomicWrite } from '../storage/files.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { normalizeStation, type Station } from '../models/station.js';
import { record, type ReadClient } from './read-client.js';

export async function syncStations(client: Pick<ReadClient, 'me' | 'stations'>, run: SnapshotRun, root: string) {
  const me = await client.me();
  const uid = me.uid;
  if (typeof uid !== 'string' || !/^1:\d+$/.test(uid)) throw new SafeError('Character response did not contain a valid character UID.');
  const stations: Station[] = [], seen = new Set<string>();
  let start = 1, pages = 0, expectedTotal: number | undefined;
  while (pages < 10_000) {
    const response = await client.stations(uid, start);
    pages++;
    const entities = record(response.entities), attrs = record(entities.attributes);
    const integer = (value: unknown): number => {
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return NaN;
      return Number(value);
    };
    const total = integer(attrs.total), pageStart = integer(attrs.start), count = integer(attrs.count);
    const rows = entities.entity;
    if (![total, pageStart, count].every(Number.isSafeInteger) || total < 0 || pageStart !== start || count < 0 || count > 200
      || !Array.isArray(rows) || count !== rows.length || (expectedTotal !== undefined && expectedTotal !== total)) {
      throw new SafeError('Inventory pagination metadata is inconsistent; partial snapshot retained.');
    }
    expectedTotal = total;
    for (const row of rows) {
      const station = normalizeStation(row, uid, run.id);
      if (seen.has(station.uid)) throw new SafeError('Repeated inventory entity; snapshot incomplete.');
      seen.add(station.uid); stations.push(station);
    }
    if (stations.length > total) throw new SafeError('Inventory count exceeds total; snapshot incomplete.');
    if (stations.length === total) {
      const summary = { schemaVersion: 1, runId: run.id, completedAt: new Date().toISOString(), characterUid: uid,
        ownedStations: stations.length, pages, consistency: 'paginated observation, not a transactional snapshot' };
      await atomicWrite(join(root, 'normalized', `${run.id}.json`), JSON.stringify({ summary, stations }, null, 2));
      await run.complete(summary);
      return summary;
    }
    if (count === 0) throw new SafeError('Empty inventory page before total reached; snapshot incomplete.');
    start += count;
  }
  throw new SafeError('Inventory page safety limit reached; snapshot incomplete.');
}
