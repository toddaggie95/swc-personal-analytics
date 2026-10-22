import { exportLabel } from '../src/storage/names.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SWCombine } from 'swcombine-sdk';
import { loadConfig, requireLive, REDIRECT_URI, SCOPES } from '../src/config/index.js';
import { beginAuth, finishAuth, loadAuth, verifyOob } from '../src/auth/session.js';
import { atomicWrite, withLock } from '../src/storage/files.js';
import { SnapshotRun } from '../src/storage/snapshots.js';
import { ReadClient, retryDelay, rateLimitDelay, facilityFilter } from '../src/swc/read-client.js';
import { syncStations, syncShips, syncFactionMaterials, syncFactionStations, syncFactionFacilities, MATERIAL_FACTIONS } from '../src/swc/sync.js';
import { normalizeStation } from '../src/models/station.js';
import { safeFailure } from '../src/config/errors.js';

test('diagnostics identify filesystem failures without revealing error messages or secrets', () => {
  const error = Object.assign(new Error('synthetic-sensitive-value'), { code: 'ENOENT', path: 'synthetic-private-path' });
  const message = safeFailure(error, 'reading the pending authorization session');
  assert.match(message, /required local file is missing/);
  assert.ok(!message.includes('synthetic'));
  assert.ok(!safeFailure(new Error('synthetic-sensitive-value'), 'input').includes('synthetic'));
});
test('missing OAuth session gives actionable diagnostics before exchange', async () => fixture(async root => {
  const config = { ...loadConfig({}), privateDir: root, clientId: 'fixture', clientSecret: 'fixture' };
  await assert.rejects(finishAuth(config, 'synthetic-code', ''), /reading the pending authorization session.*file is missing/);
}));

const auth = { accessToken: async () => 'synthetic-token', refresh: async () => {} };
const envelope = (value: unknown) => JSON.stringify({ swcapi: { result: value } });
const page = (total: number, start: number, ids: number[]) => ({ entities: {
  attributes: { total: String(total), start: String(start), count: String(ids.length) }, entity: ids.map(id => ({ uid: `5:${id}`, name: `Station ${id}` })) } });
async function fixture(work: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'swc-test-'));
  try { await work(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('both faction material routes use discovered faction UIDs and preserve lot quantities', async () => fixture(async root => {
  for (const faction of ['tff', 'tjo'] as const) {
    const ownerUid = faction === 'tff' ? '20:101' : '20:102';
    let calls = 0;
    const run = new SnapshotRun(root);
    const fetcher: typeof fetch = async (input, init) => {
      assert.equal(init?.method, 'GET');
      const url = new URL(String(input));
      if (calls++ === 0) return new Response(envelope({ uid: '1:123', factions: [
        { value: MATERIAL_FACTIONS.tff, attributes: { uid: '20:101' } },
        { value: MATERIAL_FACTIONS.tjo, attributes: { uid: '20:102' } },
      ] }));
      assert.equal(url.pathname, `/ws/v2.0/inventory/${ownerUid}/materials/owner`);
      const start = Number(url.searchParams.get('start_index'));
      return new Response(envelope({ entities: { attributes: { total: 2, start }, entity: [{ value: {
        uid: `17:${start}`, name: 'Synthetic lot', quantity: start === 1 ? '125' : undefined,
        type: { value: 'Synthetic material', attributes: { uid: 'type:17' } },
      } }] } }));
    };
    const summary = await syncFactionMaterials(new ReadClient(auth, run, fetcher), run, root, faction);
    assert.equal(summary.materialLots, 2); assert.equal(summary.ownerUid, ownerUid); assert.equal(summary.characterUid, '1:123');
    assert.equal(summary.ownedShips, undefined); assert.equal(summary.ownedStations, undefined);
    const saved = JSON.parse(await readFile(summary.exportFile, 'utf8'));
    assert.equal(saved.materials[0].ownerUid, ownerUid); assert.equal(saved.materials[0].quantity, 125);
    assert.equal(saved.materials[1].quantity, null); assert.equal(calls, 3);
  }
}));
test('missing faction and denied access never create successful empty material snapshots', async () => fixture(async root => {
  const missingRun = new SnapshotRun(root);
  let called = false;
  await assert.rejects(syncFactionMaterials({ me: async () => ({ uid: '1:123', factions: [] }), factionMaterials: async () => {
    called = true; return page(0, 1, []);
  } }, missingRun, root, 'tff'), /not uniquely identified/);
  assert.equal(called, false);
  const deniedRun = new SnapshotRun(root);
  const client = new ReadClient(auth, deniedRun, async input => new URL(String(input)).pathname.endsWith('/character/')
    ? new Response(envelope({ uid: '1:123', factions: [{ value: MATERIAL_FACTIONS.tff, attributes: { uid: '20:101' } }] }))
    : new Response('{}', { status: 403 }));
  await assert.rejects(syncFactionMaterials(client, deniedRun, root, 'tff'), /HTTP 403/);
  await assert.rejects(readFile(join(deniedRun.directory, 'complete.json')));
  assert.throws(() => client.factionMaterials('1:123', 1), /Invalid faction/);
}));
test('live access defaults closed; only eight read scopes', () => {
  assert.throws(() => requireLive(loadConfig({})), /activation/);
  assert.deepEqual(SCOPES, ['character_auth', 'character_read', 'personal_inv_overview', 'personal_inv_stations_read', 'personal_inv_ships_read', 'faction_inv_materials_read', 'faction_inv_stations_read', 'faction_inv_facilities_read']);
  assert.throws(() => loadConfig({ SWC_PRIVATE_DIR: process.cwd() }), /outside/);
});
test('OOB URL uses SDK offline flow, fixed redirect, random state and optional S256', async () => fixture(async root => {
  const config = { ...loadConfig({}), privateDir: root, clientId: 'fixture-id', clientSecret: 'fixture-secret', pkce: 's256' as const };
  const url = new URL(await beginAuth(config));
  assert.equal(url.origin + url.pathname, 'https://www.swcombine.com/ws/oauth2/auth/');
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), SCOPES.join(' '));
  assert.ok(!url.href.includes('fixture-secret'));
  assert.notEqual(url.searchParams.get('state'), new URL(await beginAuth(config)).searchParams.get('state'));
}));
test('state fails closed, rejects expiry and mismatch even in code-only mode', () => {
  const pending = { state: 'correct', createdAt: 1000, clientId: 'id', oobMode: 'state-required' as const };
  assert.throws(() => verifyOob(pending, 'code', '', 2000), /state/);
  assert.throws(() => verifyOob(pending, 'code', 'wrong', 2000), /state/);
  assert.throws(() => verifyOob(pending, 'code', 'correct', 700000), /expired/);
  verifyOob(pending, 'code', 'correct', 2000);
  verifyOob({ ...pending, oobMode: 'code-only' }, 'code', '', 2000);
  assert.throws(() => verifyOob({ ...pending, oobMode: 'code-only' }, 'code', 'wrong', 2000));
});
test('code exchange validates state before call, persists tokens, consumes session', async () => fixture(async root => {
  const config = { ...loadConfig({}), privateDir: root, clientId: 'fixture', clientSecret: 'fixture' };
  const client = new SWCombine({ clientId: 'fixture', clientSecret: 'fixture', redirectUri: REDIRECT_URI });
  await beginAuth(config, client);
  const pending = JSON.parse(await readFile(join(root, 'pending.json'), 'utf8'));
  let calls = 0;
  client.auth.handleCallback = async () => { calls++; return { success: true, token: { accessToken: 'fixture', refreshToken: 'refresh', expiresAt: Date.now() + 3600000 } }; };
  await assert.rejects(finishAuth(config, 'code', 'wrong', client)); assert.equal(calls, 0);
  assert.equal(await finishAuth(config, 'code', pending.state, client), true);
  assert.equal(calls, 1);
  assert.ok((await readdir(root)).includes('tokens.json'));
  assert.ok(!(await readdir(root)).includes('pending.json'));
  await assert.rejects(finishAuth(config, 'code', pending.state, client)); assert.equal(calls, 1);
}));
test('refresh is durable and preserves previous refresh token when omitted', async () => fixture(async root => {
  const config = { ...loadConfig({}), privateDir: root, clientId: 'fixture', clientSecret: 'fixture' };
  await atomicWrite(join(root, 'tokens.json'), JSON.stringify({ accessToken: 'old', refreshToken: 'retained', expiresAt: 1 }));
  const client = new SWCombine({ clientId: 'fixture', clientSecret: 'fixture' });
  client.refreshToken = async () => { client.setToken({ accessToken: 'new', expiresAt: Date.now() + 3600000 }); };
  const provider = await loadAuth(config, client);
  assert.equal(await provider.accessToken(), 'new');
  const saved = JSON.parse(await readFile(join(root, 'tokens.json'), 'utf8'));
  assert.equal(saved.refreshToken, 'retained'); assert.equal(saved.accessToken, 'new');
}));
test('re-consent preserves an existing refresh token when exchange omits it', async () => fixture(async root => {
  const config = { ...loadConfig({}), privateDir: root, clientId: 'fixture', clientSecret: 'fixture', oobMode: 'code-only' as const };
  await atomicWrite(join(root, 'tokens.json'), JSON.stringify({ accessToken: 'old', refreshToken: 'retained', expiresAt: 1 }));
  await beginAuth(config);
  const client = new SWCombine({ clientId: 'fixture', clientSecret: 'fixture' });
  client.auth.handleCallback = async () => ({ success: true, token: { accessToken: 'new', expiresAt: Date.now() + 3600000 } });
  assert.equal(await finishAuth(config, 'fixture-code', '', client), true);
  const saved = JSON.parse(await readFile(join(root, 'tokens.json'), 'utf8'));
  assert.equal(saved.accessToken, 'new'); assert.equal(saved.refreshToken, 'retained');
}));
test('owned ships use fixed GET endpoint, paginate and retain type and missing location', async () => fixture(async root => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, 'GET');
    if (calls++ === 0) return new Response(envelope({ uid: '1:123' }));
    assert.equal(url.pathname, '/ws/v2.0/inventory/1:123/ships/owner');
    const start = Number(url.searchParams.get('start_index'));
    assert.equal(start, calls === 2 ? 1 : 3);
    return new Response(envelope({ entities: { attributes: { total: 3, start }, entity: (start === 1 ? [1, 2] : [3]).map(id => ({
      attributes: { href: 'https://www.swcombine.com/ws/v2.0/inventory/ships/2:' + id },
      value: { uid: `2:${id}`, name: `Fixture ${id}`, type: { attributes: { uid: 'type:1' }, value: 'Fixture class' }, location: { coordinates: { galaxy: {} } } }
    })) } }));
  };
  const run = new SnapshotRun(root);
  const summary = await syncShips(new ReadClient(auth, run, fetcher), run, root);
  assert.equal(summary.ownedShips, 3); assert.equal(summary.ownedStations, undefined);
  const saved = JSON.parse(await readFile(summary.exportFile, 'utf8'));
  assert.equal(saved.ships.length, 3); assert.equal(saved.stations, undefined);
  assert.equal(saved.ships[0].entityType, 'ships'); assert.equal(saved.ships[0].typeName, 'Fixture class');
  assert.equal(saved.ships[0].coordinates.galaxy, null);
  assert.equal(calls, 3);
}));
test('mock end-to-end: character, two station pages, exact bytes and safe metadata', async () => fixture(async root => {
  const bodies = [envelope({ uid: '1:123', name: 'Fixture' }), envelope(page(3, 1, [1, 2])), envelope(page(3, 3, [3]))];
  bodies[0] = ' \n' + bodies[0] + '\n';
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'OAuth synthetic-token');
    assert.ok(!url.href.includes('synthetic-token'));
    if (calls === 0) assert.equal(url.pathname, '/ws/v2.0/character/');
    else { assert.equal(url.pathname, '/ws/v2.0/inventory/1:123/stations/owner'); assert.equal(url.searchParams.get('start_index'), calls === 1 ? '1' : '3'); }
    return new Response(bodies[calls++], { headers: { 'Content-Type': 'application/json' } });
  };
  const run = new SnapshotRun(root), result = await syncStations(new ReadClient(auth, run, fetcher), run, root);
  assert.equal(result.ownedStations, 3); assert.equal(calls, 3);
  assert.equal(await readFile(join(run.directory, '00001.body'), 'utf8'), bodies[0]);
  assert.ok(!(await readFile(join(run.directory, '00001.meta.json'), 'utf8')).includes('synthetic-token'));
  assert.ok((await readdir(run.directory)).includes('complete.json'));
}));
test('empty inventory succeeds; incomplete, repeated and changing pages fail', async () => fixture(async root => {
  const run = new SnapshotRun(root);
  const result = await syncStations({ me: async () => ({ uid: '1:1' }), stations: async () => page(0, 1, []) }, run, root);
  assert.equal(result.ownedStations, 0);
  for (const pages of [[page(2, 1, [])], [page(2, 1, [1]), page(2, 2, [1])], [page(2, 1, [1]), page(3, 2, [2])], [{ entities: {} }]]) {
    const failedRun = new SnapshotRun(root); let index = 0;
    await assert.rejects(syncStations({ me: async () => ({ uid: '1:1' }), stations: async () => pages[index++]! }, failedRun, root));
    await assert.rejects(readFile(join(failedRun.directory, 'complete.json')));
  }
}));
test('SWC pages without optional count handle empty and multipage inventories', async () => fixture(async root => {
  const withoutCount = (total: number, start: number, ids: number[]) => {
    const p = page(total, start, ids);
    return { entities: { attributes: { total: p.entities.attributes.total, start: p.entities.attributes.start }, entity: p.entities.entity } };
  };
  const empty = await syncStations({ me: async () => ({ uid: '1:1' }), stations: async () => withoutCount(0, 1, []) }, new SnapshotRun(root), root);
  assert.equal(empty.ownedStations, 0);
  const starts: number[] = [];
  const result = await syncStations({ me: async () => ({ uid: '1:1' }), stations: async (_uid, start) => {
    starts.push(start); return start === 1 ? withoutCount(3, 1, [1, 2]) : withoutCount(3, 3, [3]);
  } }, new SnapshotRun(root), root);
  assert.equal(result.ownedStations, 3); assert.deepEqual(starts, [1, 3]);
}));
test('429 Retry-After then success, and bounded 401 refresh', async () => fixture(async root => {
  let calls = 0, refreshed = 0; const delays: number[] = [];
  const run = new SnapshotRun(root);
  const client = new ReadClient({ ...auth, refresh: async () => { refreshed++; } }, run, async () => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 429, headers: { 'Retry-After': '2' } });
    if (calls === 2) return new Response('{}', { status: 401 });
    return new Response(envelope({ uid: '1:1' }));
  }, async ms => { delays.push(ms); });
  assert.equal((await client.me()).uid, '1:1'); assert.deepEqual(delays, [2000]); assert.equal(refreshed, 1);
  let repeats = 0;
  await assert.rejects(new ReadClient(auth, run, async () => { repeats++; return new Response('{}', { status: 401 }); }).me());
  assert.equal(repeats, 2);
  assert.equal(retryDelay('Thu, 01 Jan 1970 00:00:05 GMT', 0, 1000), 4000);
}));
test('malformed/Anubis response retained without retry; OAuth not captured', async () => fixture(async root => {
  const run = new SnapshotRun(root); let calls = 0;
  await assert.rejects(new ReadClient(auth, run, async () => { calls++; return new Response('<html>Anubis</html>'); }).me(), /non-JSON/);
  assert.equal(calls, 1); assert.equal(await readFile(join(run.directory, '00001.body'), 'utf8'), '<html>Anubis</html>');
}));
test('rate-limit retries are bounded and long Retry-After stops without early retry', async () => fixture(async root => {
  let calls = 0, sleeps = 0;
  const run = new SnapshotRun(root);
  await assert.rejects(new ReadClient(auth, run, async () => {
    calls++; return new Response('{}', { status: 429 });
  }, async () => { sleeps++; }).me());
  assert.equal(calls, 1); assert.equal(sleeps, 0);
  calls = 0;
  await assert.rejects(new ReadClient(auth, run, async () => {
    calls++; return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } });
  }, async () => { assert.fail('Must not retry before Retry-After'); }).me(), /Retry no earlier/);
  assert.equal(calls, 1);
}));
test('failed refresh never sends an unauthenticated data request', async () => fixture(async root => {
  let calls = 0;
  await assert.rejects(new ReadClient({ accessToken: async () => { throw new Error('fixture refresh failure'); }, refresh: async () => {} },
    new SnapshotRun(root), async () => { calls++; return new Response('{}'); }).me());
  assert.equal(calls, 0);
}));
test('normalization preserves zero coordinates and handles unknown coordinates', () => {
  const station = normalizeStation({ uid: '5:1', location: { coordinates: { galaxy: { attributes: { x: 0, y: '-2' } }, system: {} } } }, '1:1', 'test');
  assert.deepEqual(station.coordinates.galaxy, { x: 0, y: -2 }); assert.equal(station.coordinates.system, null);
  assert.equal(normalizeStation({ uid: '5:1' }, '1:1', 'test').coordinates.ground, null);
});
test('location names and UIDs survive normalization without inventing missing references', () => {
  const result = normalizeStation({ value: { uid: '5:1', location: {
    system: { value: 'Kashyyyk', attributes: { uid: '9:12', type: 'system' } },
    planet: { value: 'Kashyyyk', attributes: { uid: '7:13' } },
    container: { value: 'Synthetic warehouse', attributes: { uid: '4:99', type: 'facility' } },
    sector: {}, city: null,
  } } }, '20:1', 'fixture');
  assert.deepEqual(result.location.system, { name: 'Kashyyyk', uid: '9:12', type: 'system' });
  assert.equal(result.location.planet?.uid, '7:13');
  assert.equal(result.location.container?.name, 'Synthetic warehouse');
  assert.equal(result.location.city, null); assert.equal(result.location.sector, null);
});
test('faction station export uses faction owner route and follows pagination', async () => fixture(async root => {
  let calls = 0;
  const run = new SnapshotRun(root);
  const client = new ReadClient(auth, run, async input => {
    const url = new URL(String(input));
    if (calls++ === 0) return new Response(envelope({ uid: '1:123', factions: [{ value: MATERIAL_FACTIONS.tjo, attributes: { uid: '20:102' } }] }));
    assert.equal(url.pathname, '/ws/v2.0/inventory/20:102/stations/owner');
    const start = Number(url.searchParams.get('start_index'));
    return new Response(envelope(page(2, start, [start])));
  });
  const summary = await syncFactionStations(client, run, root, 'tjo');
  assert.equal(summary.ownerUid, '20:102'); assert.equal(summary.ownedStations, 2); assert.equal(summary.pages, 2);
  assert.throws(() => client.factionStations('1:123', 1), /Invalid faction/);
}));
test('facility location filter is sent on every page and saved in the summary', async () => fixture(async root => {
  for (const kind of ['system', 'planet'] as const) {
    const filter = facilityFilter([`--${kind}`, 'Kashyyyk']);
    let calls = 0;
    const run = new SnapshotRun(root);
    const client = new ReadClient(auth, run, async input => {
      const url = new URL(String(input));
      if (calls++ === 0) {
        assert.equal(url.pathname, `/ws/v2.0/galaxy/${kind === 'planet' ? 'planets' : 'systems'}/Kashyyyk/`);
        return new Response(envelope({ uid: kind === 'planet' ? '8:896' : '9:104', name: 'Kashyyyk' }));
      }
      if (calls === 2) return new Response(envelope({ uid: '1:123', factions: [{ value: MATERIAL_FACTIONS.tjo, attributes: { uid: '20:102' } }] }));
      assert.equal(url.pathname, '/ws/v2.0/inventory/20:102/facilities/owner');
      assert.equal(url.searchParams.get('filter_type[0]'), kind);
      assert.equal(url.searchParams.get('filter_value[0]'), kind === 'planet' ? '8:896' : '9:104');
      assert.equal(url.searchParams.get('filter_inclusion[0]'), 'includes');
      const start = Number(url.searchParams.get('start_index'));
      return new Response(envelope({ entities: { attributes: { total: 2, start }, entity: [
        { uid: `4:${start}`, location: { [kind]: { value: 'Kashyyyk', attributes: { uid: kind === 'planet' ? '8:896' : '9:104' } } } }
      ] } }));
    });
    const waits: number[] = [];
    const summary = await syncFactionFacilities(client, run, root, 'tjo', filter, async ms => { waits.push(ms); });
    assert.equal(summary.ownedFacilities, 2); assert.deepEqual(summary.locationFilter, { ...filter, uid: kind === 'planet' ? '8:896' : '9:104' });
    assert.deepEqual(waits, [6500]);
    const saved = JSON.parse(await readFile(summary.exportFile, 'utf8'));
    assert.equal(saved.facilities.length, 2);
  }
}));
test('facility sync rejects missing filters and ignored server filters', async () => fixture(async root => {
  assert.throws(() => facilityFilter([]), /requires/);
  assert.throws(() => facilityFilter(['--planet', ' ']), /requires/);
  const run = new SnapshotRun(root);
  await assert.rejects(syncFactionFacilities({
    resolveLocation: async filter => ({ ...filter, uid: '8:896' }),
    me: async () => ({ uid: '1:123', factions: [{ value: MATERIAL_FACTIONS.tjo, attributes: { uid: '20:102' } }] }),
    factionFacilities: async () => page(1, 1, [1]),
  }, run, root, 'tjo', { kind: 'planet', name: 'Kashyyyk' }), /outside the requested/);
  await assert.rejects(readFile(join(run.directory, 'complete.json')));
}));
test('single-process lock rejects concurrent access and releases on failure', async () => fixture(async root => {
  await withLock(root, async () => { await assert.rejects(withLock(root, async () => {}), /locked/); });
  await assert.rejects(withLock(root, async () => { throw new Error('fixture'); }));
  await withLock(root, async () => {});
}));

test('rate-limit reset headers take precedence over a shorter retry hint', () => {
  assert.equal(rateLimitDelay(new Headers({ 'retry-after': '2', 'x-ratelimit-reset': '120' }), 100000), 20000);
  assert.equal(rateLimitDelay(new Headers(), 100000), null);
});


test('unresolved locations never start an inventory request', async () => fixture(async root => {
  let calls = 0;
  const client = new ReadClient(auth, new SnapshotRun(root), async () => {
    calls++; return new Response(envelope({ uid: '8:896', name: 'Different planet' }));
  });
  await assert.rejects(client.resolveLocation({ kind: 'planet', name: 'Kashyyyk' }), /resolved exactly/);
  assert.equal(calls, 1);
  assert.throws(() => client.factionFacilities('20:1', 1, { kind: 'planet', name: 'Kashyyyk' }), /Resolve location/);
}));

test('material location filter is sent on every page and saved in the summary', async () => fixture(async root => {
  for (const kind of ['system', 'planet'] as const) {
    const filter = facilityFilter([`--${kind}`, 'Kashyyyk']);
    let calls = 0;
    const run = new SnapshotRun(root);
    const client = new ReadClient(auth, run, async input => {
      const url = new URL(String(input));
      if (calls++ === 0) {
        assert.equal(url.pathname, `/ws/v2.0/galaxy/${kind === 'planet' ? 'planets' : 'systems'}/Kashyyyk/`);
        return new Response(envelope({ uid: kind === 'planet' ? '8:896' : '9:104', name: 'Kashyyyk' }));
      }
      if (calls === 2) return new Response(envelope({ uid: '1:123', factions: [{ value: MATERIAL_FACTIONS.tjo, attributes: { uid: '20:102' } }] }));
      assert.equal(url.pathname, '/ws/v2.0/inventory/20:102/materials/owner');
      assert.equal(url.searchParams.get('filter_type[0]'), kind);
      assert.equal(url.searchParams.get('filter_value[0]'), kind === 'planet' ? '8:896' : '9:104');
      assert.equal(url.searchParams.get('filter_inclusion[0]'), 'includes');
      const start = Number(url.searchParams.get('start_index'));
      return new Response(envelope({ entities: { attributes: { total: 2, start }, entity: [
        { uid: `4:${start}`, location: { [kind]: { value: 'Kashyyyk', attributes: { uid: kind === 'planet' ? '8:896' : '9:104' } } } }
      ] } }));
    });
    const waits: number[] = [];
    const summary = await syncFactionMaterials(client, run, root, 'tjo', filter, async ms => { waits.push(ms); });
    assert.equal(summary.materialLots, 2); assert.deepEqual(summary.locationFilter, { ...filter, uid: kind === 'planet' ? '8:896' : '9:104' });
    assert.deepEqual(waits, [6500]);
    const saved = JSON.parse(await readFile(summary.exportFile, 'utf8'));
    assert.equal(saved.materials.length, 2);
  }
}));

test('export names describe scope and cannot introduce directories', () => {
  assert.equal(exportLabel('tff', 'materials', { kind: 'system', name: 'Kashyyyk' }), 'tff__materials__system-kashyyyk');
  assert.equal(exportLabel('personal', 'ships'), 'personal__ships__all');
  assert.equal(exportLabel('tjo', 'facilities', { kind: 'planet', name: '../Some / Planet' }), 'tjo__facilities__planet-some-planet');
});

test('station tags preserve SWC text and distinguish empty from unavailable', () => {
  const normalize = (tags: unknown) => normalizeStation({ uid: '5:1', tags }, '20:1', 'test').tags;
  assert.deepEqual(normalize({ tag: ['TJO', 'Ring Alpha; Beta', 'Mixed CASE'] }), ['TJO', 'Ring Alpha; Beta', 'Mixed CASE']);
  assert.deepEqual(normalize({ tag: [] }), []);
  assert.equal(normalize(undefined), null);
  assert.equal(normalize({ tag: ['TJO', 42] }), null);
});
