import { config as dotenv } from 'dotenv';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, requireLive, SafeError } from '../config/index.js';
import { beginAuth, finishAuth, loadAuth } from '../auth/session.js';
import { withLock } from '../storage/files.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { ReadClient, RateLimitError, facilityFilter } from '../swc/read-client.js';
import { syncStations, syncShips, syncFactionMaterials, syncFactionStations, syncFactionFacilities } from '../swc/sync.js';
import { secretInput } from './secret-input.js';
import { safeFailure } from '../config/errors.js';

dotenv({ quiet: true });
let stage = 'configuration';
async function main(): Promise<void> {
  const requestedCommand = process.argv[2] || 'help';
  const command = /^sync:materials(?::(?:tff|tjo))?$/.test(requestedCommand)
    ? requestedCommand.replace('sync:materials', 'sync:faction-materials') : requestedCommand;
  const filter = command.startsWith('sync:faction-facilities') ? facilityFilter(process.argv.slice(3)) : undefined;
  if (!filter && process.argv.length > 3) throw new SafeError('Extra arguments refused. Never pass authorization codes or tokens on the command line.');
  if (command === 'help') { console.log('Commands: status | auth:start | auth:finish | sync:stations | sync:ships | sync:faction-materials | sync:faction-materials:tff | sync:faction-materials:tjo | sync:faction-stations | sync:faction-stations:tff | sync:faction-stations:tjo | sync:faction-facilities | sync:faction-facilities:tff | sync:faction-facilities:tjo\nCompatibility aliases: sync:materials, sync:materials:tff, sync:materials:tjo.\nFacility commands require --system "Name" or --planet "Name".\nSee docs/oauth.md before live authorization.'); return; }
  const config = loadConfig();
  if (command === 'status') {
    const tokenStat = await stat(join(config.privateDir, 'tokens.json')).catch(() => null);
    console.log(JSON.stringify({ activated: config.activated, regeneratedSecretAcknowledged: config.regenerated,
      clientIdConfigured: Boolean(config.clientId), clientSecretConfigured: Boolean(config.clientSecret),
      projectDirectory: process.cwd(), privateStorageDirectory: config.privateDir,
      tokenFileModifiedAt: tokenStat?.mtime.toISOString() ?? null,
      oobMode: config.oobMode, pkce: config.pkce, liveProof: 'Not established by configuration; requires a successful live sync.' }, null, 2)); return;
  }
  if (!['auth:start', 'auth:finish', 'sync:stations', 'sync:ships', 'sync:faction-materials', 'sync:faction-materials:tff', 'sync:faction-materials:tjo', 'sync:faction-stations', 'sync:faction-stations:tff', 'sync:faction-stations:tjo', 'sync:faction-facilities', 'sync:faction-facilities:tff', 'sync:faction-facilities:tjo'].includes(command)) throw new SafeError('Unknown command. Run npm run cli -- help.');
  requireLive(config);
  await withLock(config.privateDir, async () => {
    if (command === 'auth:start') {
      console.log('Open this authorization URL yourself. It expires locally in 10 minutes.');
      console.log(await beginAuth(config));
    } else if (command === 'auth:finish') {
      stage = 'authorization code input';
      const code = await secretInput('SWC OOB authorization code (hidden): ');
      stage = 'returned state input';
      const state = await secretInput('State returned by SWC (hidden; blank only in verified code-only mode): ');
      stage = 'authorization session completion';
      const offline = await finishAuth(config, code, state);
      console.log(offline ? 'Authorization saved locally; refresh token available.' : 'Authorization saved; no refresh token returned. Offline access is not yet proven.');
    } else if (command.startsWith('sync:faction-materials') || command.startsWith('sync:faction-stations') || command.startsWith('sync:faction-facilities')) {
      const auth = await loadAuth(config);
      const factions: Array<'tff' | 'tjo'> = command.endsWith(':tff') ? ['tff'] : command.endsWith(':tjo') ? ['tjo'] : ['tff', 'tjo'];
      for (const faction of factions) {
        const run = new SnapshotRun(config.privateDir);
        try {
          const client = new ReadClient(auth, run);
          const summary = filter ? await syncFactionFacilities(client, run, config.privateDir, faction, filter)
            : await (command.startsWith('sync:faction-materials') ? syncFactionMaterials : syncFactionStations)(client, run, config.privateDir, faction);
          console.log(JSON.stringify({ faction, status: 'complete', ...summary }, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ faction, status: 'failed', error: safeFailure(error, 'faction inventory collection') }));
          process.exitCode = 1;
          if (error instanceof RateLimitError) {
            console.error('Remaining factions were not attempted because SWC rate-limited this batch.');
            break;
          }
        }
      }
    } else {
      const auth = await loadAuth(config), run = new SnapshotRun(config.privateDir);
      const sync = command === 'sync:ships' ? syncShips : syncStations;
      const summary = await sync(new ReadClient(auth, run), run, config.privateDir);
      console.log(JSON.stringify(summary, null, 2));
    }
  });
}
main().catch((error: unknown) => {
  console.error(safeFailure(error, stage));
  process.exitCode = 1;
});
