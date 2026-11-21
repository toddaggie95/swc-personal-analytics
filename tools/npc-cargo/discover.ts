import { readFile, writeFile } from 'node:fs/promises';
import { loadConfig, requireLive } from '../../src/config/index.js';
import { loadAuth } from '../../src/auth/session.js';
import { withLock } from '../../src/storage/files.js';
import { ReadClient, RateLimitError, record } from '../../src/swc/read-client.js';
import { ReadPacer } from '../../src/swc/read-pacer.js';

import { decrypt } from '../api-parity/private-audit-envelope.mjs';

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
    const detail = /^inventory\/(?:facilities\/4|ships\/2):\d+$/;
    if (!fixed.includes(route) && !inventory.test(route) && !detail.test(route)) throw new Error('Unexpected route');
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
  const pacer = new ReadPacer(undefined, undefined, 6500, 30000, 1000, Date.now() + 300000);
  let current: number[];
  let requests = 0;
  try {
    await withLock(config.privateDir, async () => {
      const auth = await loadAuth(config);
      const transport: typeof fetch = async (url, init) => {
        const target = new URL(String(url));
        if (target.origin !== 'https://www.swcombine.com' || !target.pathname.startsWith('/ws/v2.0/') ||
            init?.method !== 'GET' || ++requests > 30) throw Error('Request guard');
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
          if (error instanceof RateLimitError || status === 429 || requests > 30) throw error;
          if (status && [400, 401, 403, 404, 405].includes(status)) return null;
          if (status === 200) { entry.outcome = 'unrecognized response'; return null; }
          throw error;
        }
      }
      const input = JSON.parse(await readFile(new URL('./targets.encrypted.json', import.meta.url), 'utf8'));
      evidence.inventory.targetInput = 'encrypted targets loaded';
      const targets = JSON.parse(decrypt(input, process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!).toString('utf8')) as {
        facilities: { name: string; coordinates: number[][] }[];
        ships: { name: string }[];
      };
      evidence.inventory.targetInput = 'decrypted';
      const station = await read('inventory station detail', 'inventory/stations/5:26986');
      const owner = uid(station?.owner);
      if (station?.uid !== stationUid || station.name !== stationName || !/^20:\d+$/.test(owner)) throw Error('Station identity');
      const planet = await read('planet detail', 'galaxy/planets/Taakarroo/');
      const planetId = uid(planet);
      if (planet?.name !== 'Taakarroo' || !/^8:\d+$/.test(planetId)) throw Error('Planet identity');
      const matches: Array<Record<string, unknown>> = [];
      evidence.inventory.targetMatches = matches;
      const facilities: Data[] = [];
      let total: number | null = null;
      for (let index = 0; index < 16; index++) {
        const data = await read('planet facilities page ' + (index + 1), 'inventory/' + owner + '/facilities/owner',
          {start_index: facilities.length + 1, item_count: 200, 'filter_type[0]': 'planet',
            'filter_value[0]': planetId, 'filter_inclusion[0]': 'includes'});
        if (!data) break;
        const result = page(data);
        total = Number.isSafeInteger(result.total) ? result.total : null;
        if (!result.rows.length) break;
        facilities.push(...result.rows);
        if (total === null || facilities.length >= total) break;
      }
      evidence.inventory.facilityCoverage = {total, rows: facilities.length,
        unique: new Set(facilities.map(uid)).size};
      for (const [index, target] of targets.facilities.entries()) {
        for (const [offset, [x, y]] of target.coordinates.entries()) {
          const label = 'facility group ' + (index + 1) + ' target ' + (offset + 1);
          const locationMatches = (row: Data) => {
            const location = record(row.location);
            const surface = record(record(location.coordinates).surface);
            return uid(location.planet) === planetId && surface.x != null && surface.y != null &&
              Number(surface.x) === x && Number(surface.y) === y;
          };
          const nameMatches = (row: Data) => {
            const name = String(row.name).replace(/\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*$/, '');
            return name.trim().toLowerCase() === target.name.toLowerCase();
          };
          const candidates = facilities.filter(row => nameMatches(row) && locationMatches(row));
          const summary = { label, exactCoordinatesAndName: candidates.length, detailIdentityMatched: false };
          matches.push(summary);
          if (candidates.length !== 1) continue;
          const id = uid(candidates[0]);
          if (!/^4:\d+$/.test(id)) continue;
          const detail = await read(label + ' detail', 'inventory/facilities/' + id);
          summary.detailIdentityMatched = Boolean(detail && uid(detail) === id && nameMatches(detail) && locationMatches(detail));
        }
      }
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
