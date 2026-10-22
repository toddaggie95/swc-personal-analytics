import { exportLabel } from '../storage/names.js';
import { join } from 'node:path';
import { SafeError } from '../config/index.js';
import { atomicWrite } from '../storage/files.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { normalizeEntity, type InventoryEntity } from '../models/station.js';
import { record, type ReadClient, type LocationFilter } from './read-client.js';

interface InventorySummary {
  schemaVersion: number; runId: string; completedAt: string; characterUid: string;
  entityType: InventoryEntity['entityType']; ownedShips?: number; ownedStations?: number; ownedFacilities?: number;
  materialLots?: number; ownerUid: string; ownerName?: string;
  pages: number; consistency: string; exportFile: string; rawDirectory: string; locationFilter?: LocationFilter;
}
export const MATERIAL_FACTIONS = {
  tff: 'The Faerytail Family',
  tjo: 'The Faerytail Family: The Je`daii Order',
} as const;
export async function syncFactionMaterials(client: Pick<ReadClient, 'me' | 'factionMaterials'> & Partial<Pick<ReadClient, 'resolveLocation'>>,
  run: SnapshotRun, root: string, faction: keyof typeof MATERIAL_FACTIONS, filter?: LocationFilter,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (filter) {
    if (!client.resolveLocation) throw new SafeError('Location resolution is required for a filtered sync.');
    filter = await client.resolveLocation(filter);
  }
  return syncInventory({ me: () => client.me(), list: async (uid, start) => {
    if (filter && start > 1) await wait(6500);
    return client.factionMaterials(uid, start, filter);
  } }, run, root, 'materials', MATERIAL_FACTIONS[faction], filter);
}

export async function syncStations(client: Pick<ReadClient, 'me' | 'stations'>, run: SnapshotRun, root: string) {
  return syncInventory({ me: () => client.me(), list: (uid, start) => client.stations(uid, start) }, run, root, 'stations');
}
export async function syncFactionStations(client: Pick<ReadClient, 'me' | 'factionStations'>,
  run: SnapshotRun, root: string, faction: keyof typeof MATERIAL_FACTIONS) {
  return syncInventory({ me: () => client.me(), list: (uid, start) => client.factionStations(uid, start) },
    run, root, 'stations', MATERIAL_FACTIONS[faction]);
}
export async function syncFactionFacilities(client: Pick<ReadClient, 'me' | 'factionFacilities' | 'resolveLocation'>,
  run: SnapshotRun, root: string, faction: keyof typeof MATERIAL_FACTIONS, filter: LocationFilter,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!filter || !['system', 'planet'].includes(filter.kind) || !filter.name.trim()) throw new SafeError('A facility location filter is required.');
  filter = await client.resolveLocation(filter);
  return syncInventory({ me: () => client.me(), list: async (uid, start) => {
    if (start > 1) await wait(6500);
    return client.factionFacilities(uid, start, filter);
  } }, run, root, 'facilities', MATERIAL_FACTIONS[faction], filter);
}
export async function syncShips(client: Pick<ReadClient, 'me' | 'ships'>, run: SnapshotRun, root: string) {
  return syncInventory({ me: () => client.me(), list: (uid, start) => client.ships(uid, start) }, run, root, 'ships');
}
async function syncInventory(client: { me: ReadClient['me']; list: ReadClient['stations'] }, run: SnapshotRun, root: string, entityType: InventoryEntity['entityType'], factionName?: string, filter?: LocationFilter) {
  const me = await client.me();
  const uid = me.uid;
  if (typeof uid !== 'string' || !/^1:\d+$/.test(uid)) throw new SafeError('Character response did not contain a valid character UID.');
  let ownerUid = uid;
  if (factionName) {
    const refs = Array.isArray(me.factions) ? me.factions : [];
    const matches = refs.map(record).filter(ref => ref.value === factionName);
    const factionUid = record(matches[0]?.attributes).uid;
    if (matches.length !== 1 || typeof factionUid !== 'string' || !/^20:\d+$/.test(factionUid)) {
      throw new SafeError('Requested faction was not uniquely identified in the authenticated character response.');
    }
    ownerUid = factionUid;
  }
  const stations: InventoryEntity[] = [], seen = new Set<string>();
  let start = 1, pages = 0, expectedTotal: number | undefined;
  while (pages < 10_000) {
    const response = await client.list(ownerUid, start);
    pages++;
    const entities = record(response.entities), attrs = record(entities.attributes);
    const integer = (value: unknown): number => {
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return NaN;
      return Number(value);
    };
    const rows = entities.entity;
    // SWC may omit count; the SDK also derives it from the returned array.
    const total = integer(attrs.total), pageStart = integer(attrs.start);
    const count = attrs.count == null && Array.isArray(rows) ? rows.length : integer(attrs.count);
    if (![total, pageStart, count].every(Number.isSafeInteger) || total < 0 || pageStart !== start || count < 0 || count > 200
      || !Array.isArray(rows) || count !== rows.length || (expectedTotal !== undefined && expectedTotal !== total)) {
      throw new SafeError('Inventory pagination metadata is inconsistent; partial snapshot retained.');
    }
    expectedTotal = total;
    for (const row of rows) {
      const station = normalizeEntity(row, ownerUid, run.id, entityType);
      if (filter && station.location[filter.kind]?.uid !== filter.uid) {
        throw new SafeError('SWC returned an entity outside the requested location or with an unknown location. Collection stopped; partial snapshot retained.');
      }
      if (seen.has(station.uid)) throw new SafeError('Repeated inventory entity; snapshot incomplete.');
      seen.add(station.uid); stations.push(station);
    }
    if (stations.length > total) throw new SafeError('Inventory count exceeds total; snapshot incomplete.');
    if (stations.length === total) {
      const ownerLabel = factionName ? Object.entries(MATERIAL_FACTIONS).find(([, name]) => name === factionName)![0] : 'personal';
      const exportFile = join(root, 'normalized', `${exportLabel(ownerLabel, entityType, filter)}__${run.id}.json`);
      const summary: InventorySummary = { schemaVersion: 1, runId: run.id, exportFile, rawDirectory: run.directory, completedAt: new Date().toISOString(), characterUid: uid,
        ownerUid, ...(filter ? { locationFilter: filter } : {}), ...(factionName ? { ownerName: factionName } : {}),
        entityType, ...(entityType === 'materials' ? { materialLots: stations.length } : entityType === 'ships' ? { ownedShips: stations.length } : entityType === 'facilities' ? { ownedFacilities: stations.length } : { ownedStations: stations.length }),
        pages, consistency: 'paginated observation, not a transactional snapshot' };
      await atomicWrite(exportFile, JSON.stringify({ summary, [entityType]: stations }, null, 2));
      await run.complete(summary);
      return summary;
    }
    if (count === 0) throw new SafeError('Empty inventory page before total reached; snapshot incomplete.');
    start += count;
  }
  throw new SafeError('Inventory page safety limit reached; snapshot incomplete.');
}
