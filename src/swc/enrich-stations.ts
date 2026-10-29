import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { swcTags } from '../models/station.js';
import { createHash } from 'node:crypto';
import { MATERIAL_FACTIONS, syncFactionStations } from './sync.js';
import { SafeError } from '../config/index.js';
import { atomicWrite, readJson } from '../storage/files.js';
import { exportLabel } from '../storage/names.js';
import type { SnapshotRun } from '../storage/snapshots.js';
import { record, type LocationFilter, type ReadClient } from './read-client.js';

export function stationOperations(detail: Record<string, unknown>) {
  // Preserve API structures and status vocabulary; missing is not idle.
  const actions = record(detail.actions).action;
  const queue = record(detail.queueitems).queueitem;
  const actionList = Array.isArray(actions) ? actions : null;
  const productionActions = actionList?.filter(a => record(record(a).attributes).type === 'EntityProductionAction') ?? null;
  return {
    tags: swcTags(detail.tags),
    actions: actionList, productionActions,
    queueItems: Array.isArray(queue) ? queue : null,
    tooledTo: detail.tooledto ?? null, cargo: detail.cargo ?? null,
    underConstruction: detail.underconstruction ?? null,
    interpretation: 'Use explicit action/queue status to determine production. Tooling alone is not active production. Missing fields are unknown. Timer values retain API units.',
  };
}

export async function enrichFactionStations(
  client: Pick<ReadClient, 'resolveLocation' | 'stationDetail'>, run: SnapshotRun, root: string,
  faction: 'tff' | 'tjo', requestedFilter: LocationFilter | undefined,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  progress: (message: string) => void = console.log,
  suppliedSource?: Record<string, unknown>,
) {
  const candidates: Record<string, unknown>[] = [];
  for (const file of suppliedSource ? [] : await readdir(join(root, 'normalized'))) {
    if (!file.endsWith('.json')) continue;
    const data = record(await readJson(join(root, 'normalized', file))), summary = record(data.summary);
    if (summary.entityType === 'stations' && summary.ownerName === MATERIAL_FACTIONS[faction] && !summary.enrichment && !summary.locationFilter
        && Array.isArray(data.stations)) candidates.push(data);
  }
  candidates.sort((a, b) => String(record(b.summary).completedAt).localeCompare(String(record(a.summary).completedAt)));
  const source = suppliedSource ?? candidates[0];
  if (!source) throw new SafeError(`Run sync:faction-stations:${faction} first to create a station inventory snapshot.`);
  const sourceSummary = record(source.summary);
  const ownerUid = String(sourceSummary.ownerUid);
  if (!/^20:\d+$/.test(ownerUid)) throw new SafeError('Invalid owner in source inventory.');
  const filter = requestedFilter ? await client.resolveLocation(requestedFilter) : undefined;
  const stations = (source.stations as unknown[]).map(record).filter(s => !filter || record(record(s.location)[filter.kind]).uid === filter.uid);
  const cacheKey = createHash('sha256').update(JSON.stringify([sourceSummary.runId, ownerUid, filter?.uid])).digest('hex');
  const cacheFile = join(root, 'checkpoints', `station-details-${cacheKey}.json`);
  let cached: Record<string, unknown> = {};
  try { cached = record(await readJson(cacheFile)); } catch (error) {
    if (record(error).code !== 'ENOENT') throw error;
  }
  progress(`Enriching ${stations.length} stations from inventory dated ${String(sourceSummary.completedAt)}. Completed details are checkpointed; rerun this command to resume.`);
  const enriched = [];
  for (const station of stations) {
    const uid = String(station.uid);
    let saved = record(cached[uid]);
    if (!saved.observedAt || !('tags' in saved)) {
      // ReadClient enforces serial rate-aware pacing; do not double-sleep here.
      const detail = await client.stationDetail(uid);
      if (detail.uid !== uid || record(record(detail.owner).attributes).uid !== ownerUid
          || (filter && record(record(record(detail.location)[filter.kind]).attributes).uid !== filter.uid)) {
        throw new SafeError('Station detail identity, owner or location changed or is unavailable. Refresh the inventory before retrying.');
      }
      saved = { observedAt: new Date().toISOString(), sourceRun: run.id, rawDirectory: run.directory,
        ...stationOperations(detail) };
      cached[uid] = saved;
      await atomicWrite(cacheFile, JSON.stringify(cached, null, 2));
    }
    enriched.push({ ...station, tags: saved.tags ?? station.tags ?? null, operations: saved });
    progress(`Station details: ${enriched.length}/${stations.length}`);
  }
  const exportFile = join(root, 'normalized', `${exportLabel(faction, 'stations', filter)}__${run.id}.json`);
  const summary = { ...sourceSummary, schemaVersion: 2, runId: run.id, sourceInventoryRun: sourceSummary.runId,
    sourceInventoryCompletedAt: sourceSummary.completedAt, completedAt: new Date().toISOString(),
    locationFilter: filter, ownedStations: enriched.length, enrichment: 'station-details', detailsFetched: enriched.length,
    exportFile, rawDirectory: run.directory,
    consistency: 'Saved inventory with individually timestamped detail observations; resumed details can have earlier timestamps.' };
  await atomicWrite(exportFile, JSON.stringify({ summary, stations: enriched }, null, 2));
  await run.complete(summary);
  return summary;
}


/** One public operation: stage inventory privately, then fetch/resume details. */
export async function syncCompleteFactionStations(
  client: Pick<ReadClient, 'me' | 'factionStations' | 'resolveLocation' | 'stationDetail'>,
  run: SnapshotRun, root: string, faction: 'tff' | 'tjo', filter?: LocationFilter,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  progress: (message: string) => void = console.log,
) {
  const key = createHash('sha256').update(JSON.stringify([faction, filter?.kind, filter?.name.toLowerCase()])).digest('hex');
  const pending = join(root, 'checkpoints', `station-sync-${key}.json`);
  let source: Record<string, unknown> | undefined;
  try { source = record(await readJson(pending)); } catch (error) {
    if (record(error).code !== 'ENOENT') throw error;
  }
  if (!source) {
    progress('Collecting station inventory, then production details.');
    const inventory = await syncFactionStations(client, run, root, faction, true);
    source = record(await readJson(inventory.exportFile));
    await atomicWrite(pending, JSON.stringify(source));
  } else progress('Resuming unfinished station sync; previously fetched details will be reused.');
  const result = await enrichFactionStations(client, run, root, faction, filter, wait, progress, source);
  await rm(pending, { force: true });
  return result;
}
