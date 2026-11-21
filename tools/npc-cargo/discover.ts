import { writeFile } from 'node:fs/promises';
import { loadConfig, requireLive } from '../../src/config/index.js';
import { loadAuth } from '../../src/auth/session.js';
import { withLock } from '../../src/storage/files.js';
import { ReadClient, RateLimitError, record } from '../../src/swc/read-client.js';
import { ReadPacer } from '../../src/swc/read-pacer.js';

const stationUid = '5:26986';
const stationName = 'TFF Taakarroo Storage Depot';
const cargo = /manifest|fitout|squadron|cargo[ _-]*(?:base|source|transport)|linked[ _-]*source|berthing|loitering|transport[ _-]*(?:limit|slot)/i;
const ordinary = /^(?:cargo|tags|location|production|owner|type|uid|name)$/i;
type Data = Record<string, unknown>;
type Query = Record<string, string | number>;
class DiscoveryClient extends ReadClient {
  read(route: string, query: Query = {}) {
    const fixed = ['', 'api/permissions/', 'character/permissions/', 'character/', 'galaxy/stations/5:26986/',
      'location/stations/5:26986/', 'galaxy/planets/Taakarroo/', 'galaxy/systems/Kashyyyk/',
      'inventory/stations/5:26986'];
    const inventory = /^inventory\/20:\d+\/(?:stations|materials|facilities|ships)\/owner$/;
    const facility = /^inventory\/facilities\/4:\d+$/;
    if (!fixed.includes(route) && !inventory.test(route) && !facility.test(route)) throw new Error('Unexpected route');
    return this.get(route, query);
  }
}
const reads: Array<Record<string, unknown>> = [];
const evidence = {
  observedAt: new Date().toISOString(), stationUid, reads,
  inventory: {} as Record<string, unknown>, pacingWaitMs: 0, stopped: false,
};
function values(value: unknown) {
  const strings: string[] = [];
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') strings.push(item);
    else if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        strings.push(key);
        pending.push(child);
      }
    }
  }
  return strings;
}
function uid(item: unknown) {
  const entity = record(item);
  return String(entity.uid ?? record(entity.attributes).uid ?? '');
}
function section(data: Data) {
  return Object.hasOwn(data, 'entities') ? record(data.entities) : data;
}
function page(data: Data) {
  const entities = section(data);
  const items = Array.isArray(entities.entity) ? entities.entity : [];
  return { rows: items.map(item => record(record(item).value ?? item)),
    total: Number(record(entities.attributes).total ?? NaN) };
}
async function main() {
  const config = loadConfig();
  requireLive(config);
  const pacer = new ReadPacer(undefined, undefined, 6500, 30000, 1000, Date.now() + 240000);
  let current: number[];
  let requests = 0;
  try {
    await withLock(config.privateDir, async () => {
      const auth = await loadAuth(config);
      const transport: typeof fetch = async (url, init) => {
        const target = new URL(String(url));
        if (target.origin !== 'https://www.swcombine.com' || !target.pathname.startsWith('/ws/v2.0/') ||
            init?.method !== 'GET' || ++requests > 24) throw Error('Request guard');
        const response = await fetch(url, init);
        current.push(response.status);
        return response;
      };
      const sink = { async capture() {} } as ConstructorParameters<typeof ReadClient>[1];
      const client = new DiscoveryClient(auth, sink, transport, undefined, pacer);
      async function read(label: string, route: string, query: Query = {}) {
        current = [];
        const entry: Record<string, unknown> = { label, statuses: current, outcome: 'incomplete' };
        reads.push(entry);
        try {
          const data = await client.read(route, query);
          const strings = values(data);
          entry.outcome = 'observed';
          entry.ordinaryFields = [...new Set(Object.keys(data).filter(key => ordinary.test(key)))].sort();
          entry.cargoTermObserved = strings.some(value => cargo.test(value));
          if (label === 'resource index') {
            entry.resourceDescriptors = strings.filter(value => /^\/?(?:inventory|galaxy|location|api|character|cargo)[a-z0-9_/{ }|:.?=-]*$/i.test(value)).length;
          }
          return data;
        } catch (error) {
          const status = current.at(-1);
          if (error instanceof RateLimitError || status === 429 || requests > 24) throw error;
          if (status && [400, 401, 403, 404, 405].includes(status)) return null;
          if (status === 200) { entry.outcome = 'unrecognized response'; return null; }
          throw error;
        }
      }
      const station = await read('inventory station detail', 'inventory/stations/5:26986');
      const planet = await read('planet detail', 'galaxy/planets/Taakarroo/');
      const stationMatched = station?.uid === stationUid && station.name === stationName;
      evidence.inventory.stationMatched = stationMatched;
      const owner = uid(station?.owner), planetUid = uid(planet);
      if (!stationMatched || !/^20:\d+$/.test(owner)) return;
      const inventory = async (kind: string, filter: 'planet' | 'system' | 'container', id: string) => {
        if (!new RegExp(filter === 'planet' ? '^8:\\d+$' : filter === 'container' ? '^5:\\d+$' : '^9:\\d+$').test(id)) return [];
        const rows: Data[] = [];
        let total = NaN;
        for (let batch = 0; batch < (kind === 'facilities' ? 16 : 2); batch++) {
          const data = await read(kind + ' page ' + (batch + 1), 'inventory/' + owner + '/' + kind + '/owner',
            { start_index: rows.length + 1, item_count: 200, 'filter_type[0]': filter,
              'filter_value[0]': id, 'filter_inclusion[0]': 'includes' });
          if (!data) break;
          const result = page(data);
          total = result.total;
          if (!result.rows.length) break;
          rows.push(...result.rows);
          if (!(rows.length < total)) break;
        }
        evidence.inventory[kind] = { returned: rows.length, total, complete: rows.length === total };
        return rows;
      };
      const materials = await inventory('materials', 'container', stationUid);
      evidence.inventory.materialRowsReferencingDepot = materials.filter(row => uid(record(row.location).container) === stationUid).length;
      const facilities = await inventory('facilities', 'planet', planetUid);
      const matches = facilities.filter(row =>
        /^(?:TFF (?:Quantum|Lommite|Meleenium)|Depleted Meleenium) Taakarroo(?:\s|$)/i.test(String(row.name)));
      evidence.inventory.matchingMineNamePatternCount = matches.length;
      for (const mine of matches.slice(0, 2)) {
        const id = uid(mine);
        if (/^4:\d+$/.test(id)) await read('sample mine detail', 'inventory/facilities/' + id);
      }
      const ships = await inventory('ships', 'container', stationUid);
      evidence.inventory.shipRowsReferencingDepot = ships.filter(row => uid(record(row.location).container) === stationUid).length;
    });
  } finally {
    evidence.pacingWaitMs = pacer.summary().pacingWaitMs;
  }
}
try {
  await main();
} catch {
  evidence.stopped = true;
  console.error('NPC Cargo discovery stopped. See sanitized evidence.');
  process.exitCode = 1;
} finally {
  await writeFile(process.env.SWC_NPC_CARGO_EVIDENCE!, JSON.stringify(evidence, null, 2) + '\n');
}
