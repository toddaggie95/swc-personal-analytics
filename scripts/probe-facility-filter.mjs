// Bounded diagnostic: one row per filter, no inventory completion marker.
import { config } from 'dotenv';
import { loadConfig, requireLive, API_BASE, SafeError } from '../dist/config/index.js';
import { safeFailure } from '../dist/config/errors.js';
import { loadAuth } from '../dist/auth/session.js';
import { withLock } from '../dist/storage/files.js';
import { SnapshotRun } from '../dist/storage/snapshots.js';
config({ quiet: true });
async function main() {
  const c = loadConfig(); requireLive(c);
  await withLock(c.privateDir, async () => {
    const auth = await loadAuth(c), run = new SnapshotRun(c.privateDir);
    const token = await auth.accessToken();
    for (const value of ['Kashyyyk', '896', '8:896']) {
      const endpoint = 'inventory/20:1174/facilities/owner';
      const query = { start_index: 1, item_count: 1, 'filter_type[0]': 'planet',
        'filter_value[0]': value, 'filter_inclusion[0]': 'includes' };
      const url = new URL(endpoint, API_BASE);
      for (const [key, v] of Object.entries(query)) url.searchParams.set(key, String(v));
      const response = await fetch(url, { method: 'GET', headers: {
        Accept: 'application/json', Authorization: `OAuth ${token}`,
      }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      const body = new Uint8Array(await response.arrayBuffer());
      await run.capture(body, { endpoint, query }, response.status, response.headers.get('content-type'));
      if (!response.ok) throw new SafeError(`Probe stopped at HTTP ${response.status}; no retries or further requests. Raw response saved privately.`);
      const data = JSON.parse(Buffer.from(body).toString('utf8')).swcapi;
      if (!data?.entities || !Array.isArray(data.entities.entity)) throw new SafeError('Unexpected response; probe stopped.');
      const locations = data.entities.entity.map(entry => {
        const e = entry.value ?? entry;
        return { facilityUid: e.uid, planet: e.location?.planet, system: e.location?.system };
      });
      console.log(JSON.stringify({ filterValue: value, total: data.entities.attributes?.total,
        returned: locations.length, locations, rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
        rateLimitReset: response.headers.get('x-ratelimit-reset') }, null, 2));
      if (response.headers.get('x-ratelimit-remaining') === '0') throw new SafeError('Rate allowance exhausted; remaining probes skipped.');
      if (value !== '8:896') await new Promise(resolve => setTimeout(resolve, 6500));
    }
    console.log('Diagnostic finished. This is not a complete facility export.');
  });
}
main().catch(error => { console.error(safeFailure(error, 'bounded facility filter diagnostic')); process.exitCode = 1; });
