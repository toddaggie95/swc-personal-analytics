import { writeFile } from 'node:fs/promises';
import { loadConfig, requireLive } from '../../src/config/index.js';
import { loadAuth } from '../../src/auth/session.js';
import { withLock } from '../../src/storage/files.js';
import { ReadClient, RateLimitError } from '../../src/swc/read-client.js';
import { ReadPacer } from '../../src/swc/read-pacer.js';

const stationUid = '5:26986';
const stationName = 'TFF Taakarroo Storage Depot';
const fields = {
  inventoryCargo: ['cargo'],
  manifest: ['manifest', 'manifests', 'cargomanifest', 'cargomanifests'],
  linkedSources: ['cargosource', 'cargosources', 'linkedsources', 'linkedcargosources'],
  inventoryTags: ['tag', 'tags'],
  fitouts: ['fitout', 'fitouts', 'cargofitout', 'cargofitouts'],
  squadrons: ['squadron', 'squadrons', 'cargosquadron', 'cargosquadrons'],
};

function inspect(value: unknown) {
  const found = new Set<string>();
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
    } else if (current && typeof current === 'object') {
      for (const [key, item] of Object.entries(current)) {
        found.add(key.toLowerCase().replace(/[^a-z]/g, ''));
        pending.push(item);
      }
    }
  }
  return Object.fromEntries(Object.entries(fields).map(([topic, aliases]) => [
    topic, aliases.some(alias => found.has(alias)) ? 'matching field present' : 'no matching field observed',
  ]));
}

const evidence = {
  target: { stationUid, stationName, system: 'Kashyyyk' },
  observedAt: new Date().toISOString(),
  request: { method: 'GET', route: 'inventory/stations/5:26986', statuses: [] as number[] },
  outcome: 'setup incomplete',
  identityMatched: false,
  coverage: {} as Record<string, string>,
  pacingWaitMs: 0,
};

async function main() {
  const config = loadConfig();
  requireLive(config);
  const pacer = new ReadPacer(undefined, undefined, 6500, 30_000, 1000, Date.now() + 180_000);
  try {
    await withLock(config.privateDir, async () => {
      const auth = await loadAuth(config);
      const transport: typeof fetch = async (...args) => {
        const response = await fetch(...args);
        evidence.request.statuses.push(response.status);
        return response;
      };
      // Retain only selected observations. The shared client still handles GET, auth, retries and quota.
      const sink = { async capture() {} } as ConstructorParameters<typeof ReadClient>[1];
      const client = new ReadClient(auth, sink, transport, undefined, pacer);
      const station = await client.stationDetail(stationUid);
      evidence.identityMatched = station.uid === stationUid && station.name === stationName;
      evidence.outcome = evidence.identityMatched ? 'station read confirmed' : 'station identity mismatch';
      if (!evidence.identityMatched) throw Error('identity');
      evidence.coverage = inspect(station);
    });
  } catch (error) {
    if (evidence.outcome !== 'station identity mismatch') {
      evidence.outcome = error instanceof RateLimitError ? 'rate limit stop' : 'read or authentication incomplete';
    }
    throw error;
  } finally {
    evidence.pacingWaitMs = pacer.summary().pacingWaitMs;
  }
}

try {
  await main();
} catch {
  console.error('NPC Cargo probe ended with incomplete coverage. See sanitized evidence.');
  process.exitCode = 1;
} finally {
  await writeFile(process.env.SWC_NPC_CARGO_EVIDENCE!, JSON.stringify(evidence, null, 2) + '\n');
}
