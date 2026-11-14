import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Load the real session implementation with deterministic I/O and SDK boundaries.
async function session({ rejectRefresh = false, rejectSave = false, missingWriter = false } = {}) {
  const source = readFileSync(new URL('../../src/auth/session.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const prelude = `
    class SafeError extends Error {}
    const join = (...parts) => parts.join('/');
    const writes = [];
    let refreshes = 0, saves = 0;
    let token = { accessToken: 'fixture-old', refreshToken: 'fixture-refresh', expiresAt: 0 };
    const readJson = async () => ({ ...token });
    const atomicWrite = async (path, data) => { writes.push({path, data}); };
    const requireHostedWriter = () => { if (${missingWriter}) throw new SafeError('missing writer'); };
    const persistHostedToken = async () => { saves++; if (${rejectSave}) throw new SafeError('save failed'); };
    const client = {
      setToken: value => { token = value; }, getToken: () => token,
      hasRefreshToken: () => true,
      refreshToken: async () => {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 5));
        if (${rejectRefresh}) throw {status:400, message:'sensitive fixture error'};
        token = { accessToken:'fixture-new', refreshToken:'fixture-rotated', expiresAt:Date.now()+3600000 };
      }
    };
    export const fixture = {client, writes, counts: () => ({refreshes, saves})};
  `;
  return import('data:text/javascript;base64,' + Buffer.from(prelude + stripTypeScriptTypes(source)).toString('base64') + '#' + Math.random());
}

test('concurrent expiry checks refresh once and await durable save', async () => {
  const m = await session();
  const auth = await m.loadAuth({privateDir:'/fixture'}, m.fixture.client);
  assert.deepEqual(await Promise.all(Array.from({length:8}, () => auth.accessToken())), Array(8).fill('fixture-new'));
  assert.deepEqual(m.fixture.counts(), {refreshes:1, saves:1});
  assert.equal(m.fixture.writes.length, 2);
  assert.match(m.fixture.writes[1].path, /persisted-tokens.json$/);
});
test('HTTP 400 rejection is sanitized and latched: no repeated refresh', async () => {
  const m = await session({rejectRefresh:true});
  const auth = await m.loadAuth({privateDir:'/fixture'}, m.fixture.client);
  for (let i=0;i<3;i++) await assert.rejects(auth.accessToken(), /HTTP 400\/401/);
  assert.deepEqual(m.fixture.counts(), {refreshes:1, saves:0});
  assert.equal(m.fixture.writes.length, 0);
});
test('durable save failure blocks access and further refresh attempts', async () => {
  const m = await session({rejectSave:true});
  const auth = await m.loadAuth({privateDir:'/fixture'}, m.fixture.client);
  await assert.rejects(auth.accessToken(), /save failed/);
  await assert.rejects(auth.accessToken(), /save failed/);
  await assert.rejects(auth.refresh(), /save failed/);
  assert.deepEqual(m.fixture.counts(), {refreshes:1, saves:1});
  assert.equal(m.fixture.writes.length, 1);
});
test('missing hosted writer refuses rotation before consuming refresh token', async () => {
  const m = await session({missingWriter:true});
  const auth = await m.loadAuth({privateDir:'/fixture'}, m.fixture.client);
  await assert.rejects(auth.accessToken(), /missing writer/);
  assert.deepEqual(m.fixture.counts(), {refreshes:0, saves:0});
});
