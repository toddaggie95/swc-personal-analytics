import { API_BASE, SafeError } from '../config/index.js';
import { ReadPacer } from './read-pacer.js';
import type { AuthProvider } from '../auth/session.js';
import type { SnapshotRun } from '../storage/snapshots.js';

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function unwrap(value: unknown): Record<string, unknown> {
  const root = record(value);
  if (!('swcapi' in root)) throw new SafeError('Unexpected API envelope; raw response retained.');
  const wrapper = record(root.swcapi), keys = Object.keys(wrapper);
  return keys.length === 1 ? record(wrapper[keys[0]!]) : wrapper;
}
export function retryDelay(header: string | null, attempt: number, now = Date.now()): number {
  if (header) {
    const delay = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
    if (Number.isFinite(delay)) return Math.max(0, delay);
  }
  return 1000 * 2 ** attempt;
}
export interface LocationFilter { kind: 'system' | 'planet'; name: string; uid?: string }
export function facilityFilter(args: string[]): LocationFilter {
  if (args.length !== 2 || !['--system', '--planet'].includes(args[0]!) || !args[1]?.trim() || args[1].trim().length > 120) {
    throw new SafeError('Location filter requires --system "System name" or --planet "Planet name".');
  }
  return { kind: args[0] === '--system' ? 'system' : 'planet', name: args[1].trim() };
}
export class RateLimitError extends SafeError {}
export function rateLimitDelay(headers: Headers, now = Date.now()): number | null {
  const retry = headers.get('retry-after');
  const reset = headers.get('x-ratelimit-reset');
  const delays: number[] = [];
  if (retry) {
    const n = /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now;
    if (Number.isFinite(n)) delays.push(Math.max(0, n));
  }
  if (reset && /^\d+$/.test(reset)) delays.push(Math.max(0, Number(reset) * 1000 - now));
  return delays.length ? Math.max(...delays) : null;
}
export class ReadClient {
  constructor(private auth: AuthProvider, private snapshots: SnapshotRun,
    private fetcher: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
    private pacer: ReadPacer = new ReadPacer(sleep)) {}
  stationDetail(uid: string): Promise<Record<string, unknown>> {
    if (!/^5:\d+$/.test(uid)) throw new SafeError('Invalid station UID.');
    return this.get(`inventory/stations/${uid}`, {});
  }
  me(): Promise<Record<string, unknown>> { return this.get('character/', {}); }
  stations(uid: string, start: number): Promise<Record<string, unknown>> {
    if (!/^1:\d+$/.test(uid) || !Number.isSafeInteger(start) || start < 1) throw new SafeError('Invalid character UID or page index.');
    return this.get(`inventory/${uid}/stations/owner`, { start_index: start, item_count: 200 });
  }
  ships(uid: string, start: number): Promise<Record<string, unknown>> {
    if (!/^1:\d+$/.test(uid) || !Number.isSafeInteger(start) || start < 1) throw new SafeError('Invalid character UID or page index.');
    return this.get(`inventory/${uid}/ships/owner`, { start_index: start, item_count: 200 });
  }
  factionMaterials(uid: string, start: number, filter?: LocationFilter): Promise<Record<string, unknown>> {
    if (!/^20:\d+$/.test(uid) || !Number.isSafeInteger(start) || start < 1) throw new SafeError('Invalid faction UID or page index.');
    if (filter && (!filter.uid || !(filter.kind === 'planet' ? /^8:\d+$/ : /^9:\d+$/).test(filter.uid))) throw new SafeError('Resolve location to a UID before collecting materials.');
    return this.get(`inventory/${uid}/materials/owner`, { start_index: start, item_count: 200,
      ...(filter ? { 'filter_type[0]': filter.kind, 'filter_value[0]': filter.uid!, 'filter_inclusion[0]': 'includes' } : {}) });
  }
  factionStations(uid: string, start: number): Promise<Record<string, unknown>> {
    if (!/^20:\d+$/.test(uid) || !Number.isSafeInteger(start) || start < 1) throw new SafeError('Invalid faction UID or page index.');
    return this.get(`inventory/${uid}/stations/owner`, { start_index: start, item_count: 200 });
  }
  async resolveLocation(filter: LocationFilter): Promise<LocationFilter> {
    const kind = filter.kind;
    if (!['system', 'planet'].includes(kind) || !filter.name.trim()) throw new SafeError('Invalid location filter.');
    const data = await this.get(`galaxy/${kind === 'planet' ? 'planets' : 'systems'}/${encodeURIComponent(filter.name)}/`, {});
    const prefix = kind === 'planet' ? '8:' : '9:';
    if (typeof data.uid !== 'string' || !data.uid.startsWith(prefix) || !/^\d+:\d+$/.test(data.uid)
      || typeof data.name !== 'string' || data.name.toLowerCase() !== filter.name.toLowerCase()) {
      throw new SafeError('Location could not be resolved exactly; inventory collection was not started.');
    }
    return { kind, name: data.name, uid: data.uid };
  }
  factionFacilities(uid: string, start: number, filter: LocationFilter): Promise<Record<string, unknown>> {
    if (!/^20:\d+$/.test(uid) || !Number.isSafeInteger(start) || start < 1) throw new SafeError('Invalid faction UID or page index.');
    if (!filter || !['system', 'planet'].includes(filter.kind) || !filter.name.trim()) throw new SafeError('A facility location filter is required.');
    if (!filter.uid || !(filter.kind === 'planet' ? /^8:\d+$/ : /^9:\d+$/).test(filter.uid)) throw new SafeError('Resolve location to a UID before collecting facilities.');
    return this.get(`inventory/${uid}/facilities/owner`, { start_index: start, item_count: 200,
      'filter_type[0]': filter.kind, 'filter_value[0]': filter.uid!, 'filter_inclusion[0]': 'includes' });
  }
  private async get(endpoint: string, query: Record<string, number | string>): Promise<Record<string, unknown>> {
    const url = new URL(endpoint, API_BASE);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    let refreshed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const resource = endpoint.startsWith('inventory/stations/') ? 'station-detail' : endpoint.split('/').slice(0, 2).join('/');
      try { await this.pacer.beforeRequest(resource); } catch { throw new RateLimitError('SWC pacing requires a long wait or has no reliable reset; partial data retained.'); }
      const token = await this.auth.accessToken();
      let response: Response;
      try {
        response = await this.fetcher(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `OAuth ${token}` },
          redirect: 'error', signal: AbortSignal.timeout(30_000) });
      } catch { throw new SafeError('SWC request failed or timed out. No credentials have been logged.'); }
      this.pacer.afterResponse(resource, response.headers);
      const body = new Uint8Array(await response.arrayBuffer());
      // Only sanctioned data endpoints are captured; OAuth responses are never snapshots.
      await this.snapshots.capture(body, { endpoint, query }, response.status, response.headers.get('content-type'));
      if (response.status === 429) {
        const delay = rateLimitDelay(response.headers);
        if (delay !== null && delay <= 60_000 && attempt < 3) {
          await this.sleep(Math.max(1000, delay)); continue;
        }
        throw new RateLimitError(delay === null
          ? 'SWC rate limit reached. No reset time supplied; stop syncing and try later. Partial data retained.'
          : `SWC rate limit reached. Retry no earlier than ${new Date(Date.now() + delay).toISOString()}. Partial data retained.`);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.from(body).toString('utf8')) as unknown; } catch {
        throw new SafeError('SWC returned non-JSON (possibly Anubis). Response preserved; no bypass attempted.');
      }
      if (response.status === 401 && !refreshed) { refreshed = true; await this.auth.refresh(); continue; }
      const obj = record(parsed);
      const limited = response.status === 429 || (response.status === 400 && (obj.error === 'rate_limit_exceeded'
        || [obj.message, obj.error_description].some(v => typeof v === 'string' && /rate limit/i.test(v))));
      if (limited) throw new RateLimitError('SWC rate limit reached. Stop syncing and try later; partial data retained.');
      if ((response.status >= 500) && attempt < 3) {
        const delay = retryDelay(response.headers.get('retry-after'), attempt);
        if (delay > 60_000) throw new SafeError('SWC requested a long retry delay. Try later; partial raw data retained.');
        await this.sleep(delay); continue;
      }
      if (!response.ok) throw new SafeError(`SWC data request failed (HTTP ${response.status}). Raw response retained privately.`);
      if ('error' in obj || 'error' in record(obj.swcapi)) throw new SafeError('SWC returned an API error; raw response retained.');
      return unwrap(parsed);
    }
    throw new SafeError('SWC retry limit reached; partial raw data retained.');
  }
}
