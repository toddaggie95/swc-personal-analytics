import { config as dotenv } from 'dotenv';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadConfig, requireLive, SafeError } from '../config/index.js';
import { loadAuth, validToken } from '../auth/session.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { ReadClient } from '../swc/read-client.js';

dotenv({ quiet: true });

// Read-only, one-request authentication probe. Never print OAuth tokens,
// raw response bodies, station inventories or refresh-token fingerprints.
async function main(): Promise<void> {
  const config = loadConfig();
  requireLive(config);
  const old = JSON.parse(await readFile(join(config.privateDir, 'tokens.json'), 'utf8')) as unknown;
  if (!validToken(old)) throw new SafeError('OAuth token JSON is invalid.');
  const initialRefresh = old.refreshToken;
  const auth = await loadAuth(config);
  const run = new SnapshotRun(config.privateDir, 'github-auth-probe');
  const response = await new ReadClient(auth, run).me();
  if (typeof response.uid !== 'string' || !/^1:\d+$/.test(response.uid)) {
    throw new SafeError('Authenticated SWC response did not contain a valid character UID.');
  }
  const updated = JSON.parse(await readFile(join(config.privateDir, 'tokens.json'), 'utf8')) as unknown;
  if (!validToken(updated)) throw new SafeError('Refreshed token JSON failed validation.');
  const rotated = updated.refreshToken !== initialRefresh;
  const refreshed = updated.accessToken !== old.accessToken || updated.expiresAt !== old.expiresAt;
  console.log(JSON.stringify({
    authenticated: true,
    requests: 1,
    accessTokenRefreshed: refreshed,
    refreshTokenChanged: rotated,
    refreshTokenAvailable: Boolean(updated.refreshToken),
    nextRunRequiresPersistence: rotated,
  }));
  if (rotated) throw new SafeError('Refresh token rotated. Stop: durable persistence is required before another hosted collection.');
}
main().catch(() => {
  // Do not expose SDK or API errors in CI, including accidental secrets in exception messages.
  console.error('SWC authentication probe failed. Inspect configuration and token expiry privately.');
  process.exitCode = 1;
});
