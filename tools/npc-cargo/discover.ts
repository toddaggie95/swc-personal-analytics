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
    const fixed = ['', 'api/permissions/', 'character/permissions/', 'character/', 'events/personal/', 'events/faction/', 'events/inventory/', 'galaxy/stations/5:26986/',
      'location/stations/5:26986/', 'galaxy/planets/Taakarroo/', 'galaxy/systems/Kashyyyk/',
      'inventory/stations/5:26986'];
    const inventory = /^inventory\/20:\d+\/(?:stations|materials|facilities|ships)\/owner$/;
    const detail = /^inventory\/(?:facilities\/4|ships\/2):\d+$/;
    const supplementary = /^(?:character\/1:\d+\/permissions\/|location\/ships\/2:\d+\/|types\/ships\/2:\d+\/)$/;
    if (!fixed.includes(route) && !inventory.test(route) && !detail.test(route) && !supplementary.test(route)) throw new Error('Unexpected route');
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
      const station = await read('inventory station detail', 'inventory/stations/5:26986');
      const owner = uid(station?.owner);
      const character = await read('current character identity', 'character/');
      const characterUid = uid(character);
      if (/^1:\d+$/.test(characterUid)) {
        const grants = await read('UID-specific app permissions', 'character/' + characterUid + '/permissions/');
        if (grants) evidence.inventory.eventPermissionMentioned = values(grants).includes('character_events');
      }
      const input = JSON.parse(await readFile(new URL('./targets.encrypted.json', import.meta.url), 'utf8'));
      const targets = JSON.parse(decrypt(input, process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!).toString('utf8')) as {ships: {name: string}[]; squadronId: string};
      const squadronId = /^\d+$/.test(targets.squadronId) ? new RegExp("\\b" + targets.squadronId + "\\b") : null;
      const eventPattern = /cargo[ _-]*(?:squadron|transport|manifest|source|base)|loiter(?:ing|ed)?|berthing fee/i;
      const eventSummary: Array<Record<string, unknown>> = [];
      evidence.inventory.eventFeeds = eventSummary;
      const factionId = /^20:\d+$/.test(owner) ? Number(owner.split(':')[1]) : 0;
      for (const mode of ['personal', 'faction', 'inventory']) {
        if (mode === 'faction' && !factionId) continue;
        const query: Query = {start_index: 0, item_count: 100};
        if (mode === 'faction') query.faction_id = factionId;
        const data = await read(mode + ' events', 'events/' + mode + '/', query);
        if (!data) continue;
        const envelope = Object.hasOwn(data, 'events') ? record(data.events) : data;
        const events = Array.isArray(envelope.event) ? envelope.event : envelope.event ? [envelope.event] : [];
        const matches = events.filter(event => values(event).some(value => eventPattern.test(value)));
        const knownFields = /^(?:attributes|type|category|uid|id|time|timestamp|date|title|text|message|subject|location|entity|eventid|squadron|base)$/i;
        eventSummary.push({mode, listed: events.length, recognizedEventCollection: Object.hasOwn(envelope, 'event'),
          cargoLikeEvents: matches.length,
          explicitCargoSquadronText: events.filter(event => values(record(event).text).some(value => /\bcargo[\s-]+squadron\b/i.test(value))).length,
          explicitCargoTransportText: events.filter(event => values(record(event).text).some(value => /\bcargo[\s-]+transport\b/i.test(value))).length,
          loiterText: events.filter(event => values(record(event).text).some(value => /\bloiter(?:ing|ed)?\b/i.test(value))).length,
          matchedDepotMention: matches.some(event => values(event).some(value => /\b26986\b|taakarroo storage depot/i.test(value))),
          matchedScreenshotSquadronId: matches.some(event => values(event).some(value => squadronId?.test(value))),
          fields: [...new Set(matches.flatMap(event => Object.keys(record(event)).filter(key => knownFields.test(key))))].sort()});
      }
      if (station?.uid !== stationUid || station.name !== stationName || !/^20:\d+$/.test(owner)) return;
      const shipChecks: Array<Record<string, unknown>> = [];
      evidence.inventory.shipChecks = shipChecks;
      const examinedTypes = new Map<string, Data | null>();
      for (const [index, target] of targets.ships.entries()) {
        const label = 'ship target ' + (index + 1);
        const inventory = await read(label + ' name lookup', 'inventory/' + owner + '/ships/owner',
          {start_index: 1, item_count: 20, 'filter_type[0]': 'name', 'filter_value[0]': target.name, 'filter_inclusion[0]': 'includes'});
        if (!inventory) continue;
        const rows = page(inventory).rows.filter(row => row.name === target.name);
        const shipId = uid(rows[0]);
        if (rows.length !== 1 || !/^2:\d+$/.test(shipId)) continue;
        const detail = await read(label + ' inventory detail', 'inventory/ships/' + shipId);
        if (detail?.uid !== shipId || detail.name !== target.name) continue;
        const location = await read(label + ' location', 'location/ships/' + shipId + '/');
        const typeId = uid(detail.type);
        if (/^2:\d+$/.test(typeId) && !examinedTypes.has(typeId)) {
          examinedTypes.set(typeId, await read(label + ' ship type', 'types/ships/' + typeId + '/'));
        }
        const type = examinedTypes.get(typeId);
        const typeKeys = Object.keys(type ?? {}).filter(key => /cargo|capacity|volume|weight|speed|hyperdrive/i.test(key));
        shipChecks.push({label, locationObserved: Boolean(location),
          locationMentionsDepot: values(location).some(value => value === stationUid || value === stationName),
          typeObserved: Boolean(type), typeCapacityOrSpeedFields: typeKeys});
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
