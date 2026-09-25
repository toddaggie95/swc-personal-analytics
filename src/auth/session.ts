import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { SWCombine, AccessType, createPkcePair, type OAuthToken } from 'swcombine-sdk';
import { type Config, REDIRECT_URI, SCOPES, SafeError } from '../config/index.js';
import { atomicWrite, readJson } from '../storage/files.js';

interface Pending { state: string; createdAt: number; clientId: string; verifier?: string; oobMode: Config['oobMode'] }
export function makeClient(config: Config): SWCombine {
  return new SWCombine({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: REDIRECT_URI, accessType: AccessType.Offline, debug: false, maxRetries: 0 });
}
export function validToken(value: unknown): value is OAuthToken {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.accessToken === 'string' && v.accessToken.length > 0 && typeof v.expiresAt === 'number'
    && Number.isFinite(v.expiresAt) && (v.refreshToken === undefined || typeof v.refreshToken === 'string');
}
export async function beginAuth(config: Config, client = makeClient(config)): Promise<string> {
  const pair = config.pkce === 's256' ? createPkcePair() : undefined;
  const pending: Pending = { state: randomBytes(32).toString('base64url'), createdAt: Date.now(),
    clientId: config.clientId, oobMode: config.oobMode, ...(pair ? { verifier: pair.codeVerifier } : {}) };
  await atomicWrite(join(config.privateDir, 'pending.json'), JSON.stringify(pending));
  return client.auth.getAuthorizationUrl({ scopes: SCOPES, state: pending.state,
    ...(pair ? { codeChallenge: pair.codeChallenge } : {}) });
}
export function verifyOob(pending: Pending, code: string, state: string, now = Date.now()): void {
  if (now - pending.createdAt > 10 * 60_000 || now < pending.createdAt) throw new SafeError('Authorization session expired; start again.');
  if (!code.trim() || code.length > 4096 || /[\s\x00-\x1f]/u.test(code)) throw new SafeError('Enter only the authorization code displayed by SWC.');
  if (!state && pending.oobMode === 'code-only') return;
  const actual = Buffer.from(state), expected = Buffer.from(pending.state);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new SafeError('Returned state missing or mismatched. Do not copy state from the authorization URL. See docs/oauth.md.');
  }
}
export async function finishAuth(config: Config, code: string, state: string, client = makeClient(config)): Promise<boolean> {
  const path = join(config.privateDir, 'pending.json');
  const pending = await readJson(path) as Pending;
  if (pending.clientId !== config.clientId || typeof pending.state !== 'string' || !Number.isFinite(pending.createdAt)
    || !['state-required', 'code-only'].includes(pending.oobMode)) throw new SafeError('Invalid pending session; start again.');
  verifyOob(pending, code, state);
  // Consume before exchange; failed/uncertain exchanges require a fresh authorization.
  await rm(path);
  const result = await client.auth.handleCallback({ code, ...(state ? { state } : {}) }, pending.verifier);
  if (!result.success || !validToken(result.token)) throw new SafeError('OAuth exchange failed. Check activation, regenerated secret and OOB compatibility; start again.');
  await atomicWrite(join(config.privateDir, 'tokens.json'), JSON.stringify(result.token));
  return Boolean(result.token.refreshToken);
}
export interface AuthProvider { accessToken(): Promise<string>; refresh(): Promise<void> }
export async function loadAuth(config: Config, client = makeClient(config)): Promise<AuthProvider> {
  const token = await readJson(join(config.privateDir, 'tokens.json'));
  if (!validToken(token)) throw new SafeError('Invalid local token storage; authorize again.');
  client.setToken(token);
  async function refresh(): Promise<void> {
    if (!client.hasRefreshToken()) throw new SafeError('No refresh token available; authorize again with offline access.');
    await client.refreshToken();
    const refreshed = client.getToken();
    if (!validToken(refreshed)) throw new SafeError('Token refresh returned an invalid result.');
    // Await durability before issuing a data request (SDK persistence is not awaitable).
    await atomicWrite(join(config.privateDir, 'tokens.json'), JSON.stringify(refreshed));
  }
  return { refresh, async accessToken() {
    const current = client.getToken();
    if (!current) throw new SafeError('Authorize first.');
    if (current.expiresAt <= Date.now() + 300_000) await refresh();
    const ready = client.getToken();
    if (!ready) throw new SafeError('Authorize first.');
    return ready.accessToken;
  } };
}
