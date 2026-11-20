import { config as dotenv } from 'dotenv';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadConfig, requireLive, SafeError } from '../config/index.js';
import { loadAuth, makeClient, validToken } from '../auth/session.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { ReadClient } from '../swc/read-client.js';

dotenv({ quiet: true });

// Read-only, one-request authentication probe. Never print OAuth tokens,
// raw response bodies, station inventories or refresh-token fingerprints.
let stage = 'configuration';
async function main(): Promise<void> {
  stage = 'configuration';
  const config = loadConfig();
  requireLive(config);
  stage = 'token-file validation';
  const old = JSON.parse(await readFile(join(config.privateDir, 'tokens.json'), 'utf8')) as unknown;
  if (!validToken(old)) throw new SafeError('OAuth token JSON is invalid.');
  const initialRefresh = old.refreshToken;
  console.log('Token expiry category: ' + (old.expiresAt <= Date.now() + 300_000 ? 'refresh-needed' : 'not-near-expiry'));
  stage = 'OAuth client initialization';
  const auth = await loadAuth(config);
  if (process.env.SWC_FORCE_REFRESH === 'true') {
    stage = 'controlled OAuth refresh and durable persistence';
    await auth.refresh();
  }
  const run = new SnapshotRun(config.privateDir, 'github-auth-probe');
  const wrapped = {
    async accessToken() { stage = 'access token acquisition and possible refresh'; return auth.accessToken(); },
    async refresh() { stage = 'refresh after HTTP 401'; return auth.refresh(); },
  };
  stage = 'authenticated character request or token refresh';
  const response = await new ReadClient(wrapped, run).me();
  if (typeof response.uid !== 'string' || !/^1:\d+$/.test(response.uid)) {
    throw new SafeError('Authenticated SWC response did not contain a valid character UID.');
  }
  stage = 'post-request token validation';
  const updated = JSON.parse(await readFile(join(config.privateDir, 'tokens.json'), 'utf8')) as unknown;
  if (!validToken(updated)) throw new SafeError('Refreshed token JSON failed validation.');
  if (process.env.SWC_REQUIRE_FACILITY_ASSIGN === 'true') {
    stage = 'facility assignment grant verification';
    // The coordinator owns renewal. The scope lookup uses an access-only SDK client.
    const permissionClient = makeClient(config);
    const {refreshToken: _refreshToken, ...accessOnly} = updated;
    permissionClient.setToken(accessOnly);
    const scopes = await permissionClient.character.permissions.getScopes({uid: response.uid});
    if (!Array.isArray(scopes) || !scopes.some(scope => typeof scope === 'string' &&
        ['faction_inv_facilities_assign', 'faction_inv_facilities_all'].includes(scope.toLowerCase()))) {
      throw new SafeError('Facility assignment scope is not granted to the shared SWC app.');
    }
    console.log('Shared SWC facility assignment permission verified.');
  }
  const rotated = updated.refreshToken !== initialRefresh;
  const refreshed = updated.accessToken !== old.accessToken || updated.expiresAt !== old.expiresAt;
  console.log(JSON.stringify({
    authenticated: true,
    requests: process.env.SWC_REQUIRE_FACILITY_ASSIGN === 'true' ? 2 : 1,
    accessTokenRefreshed: refreshed,
    refreshTokenChanged: rotated,
    refreshTokenAvailable: Boolean(updated.refreshToken),
    nextRunRequiresPersistence: rotated && process.env.GITHUB_ACTIONS !== 'true',
  }));
  if (rotated && process.env.GITHUB_ACTIONS !== 'true') throw new SafeError('Refresh token rotated. Stop: durable persistence is required before another hosted collection.');
}
main().catch((error: unknown) => {
  // Do not expose SDK or API errors in CI, including accidental secrets in exception messages.
  console.error('SWC authentication probe failed during: ' + stage + '. No sensitive error details printed.');
  const message=error instanceof Error?error.message:'';
  const category=message.startsWith('OAuth refresh rejected by server')?'oauth-refresh-rejected':
    message.startsWith('OAuth refresh forbidden')?'oauth-refresh-forbidden':
    message.startsWith('OAuth refresh rate-limited')?'oauth-refresh-rate-limited':
    message.startsWith('OAuth refresh network')?'oauth-refresh-network':
    message.startsWith('OAuth refresh failed due to server')?'oauth-refresh-server':
    /persist|secret writer/i.test(message)?'token-persistence':
    message.startsWith('Facility assignment scope is not granted')?'facility-assignment-scope-missing':
    stage==='facility assignment grant verification'?'facility-assignment-scope-unverified':'unclassified';
  console.error('AUTH_FAILURE_CATEGORY '+category);
  process.exitCode = 1;
});
