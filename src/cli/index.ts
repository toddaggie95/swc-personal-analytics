import { config as dotenv } from 'dotenv';
import { loadConfig, requireLive, SafeError } from '../config/index.js';
import { beginAuth, finishAuth, loadAuth } from '../auth/session.js';
import { withLock } from '../storage/files.js';
import { SnapshotRun } from '../storage/snapshots.js';
import { ReadClient } from '../swc/read-client.js';
import { syncStations, syncShips, syncFactionMaterials } from '../swc/sync.js';
import { secretInput } from './secret-input.js';
import { safeFailure } from '../config/errors.js';

dotenv({ quiet: true });
let stage = 'configuration';
async function main(): Promise<void> {
  const command = process.argv[2] || 'help';
  if (process.argv.length > 3) throw new SafeError('Extra arguments refused. Never pass authorization codes or tokens on the command line.');
  if (command === 'help') { console.log('Commands: status | auth:start | auth:finish | sync:stations | sync:ships | sync:materials | sync:materials:tff | sync:materials:tjo\nSee docs/oauth.md before live authorization.'); return; }
  const config = loadConfig();
  if (command === 'status') {
    console.log(JSON.stringify({ activated: config.activated, regeneratedSecretAcknowledged: config.regenerated,
      clientIdConfigured: Boolean(config.clientId), clientSecretConfigured: Boolean(config.clientSecret),
      oobMode: config.oobMode, pkce: config.pkce, liveProof: 'Not established by configuration; requires a successful live sync.' }, null, 2)); return;
  }
  if (!['auth:start', 'auth:finish', 'sync:stations', 'sync:ships', 'sync:materials', 'sync:materials:tff', 'sync:materials:tjo'].includes(command)) throw new SafeError('Unknown command. Run npm run cli -- help.');
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
    } else if (command.startsWith('sync:materials')) {
      const auth = await loadAuth(config);
      const factions: Array<'tff' | 'tjo'> = command === 'sync:materials:tff' ? ['tff'] : command === 'sync:materials:tjo' ? ['tjo'] : ['tff', 'tjo'];
      for (const faction of factions) {
        const run = new SnapshotRun(config.privateDir);
        try {
          const summary = await syncFactionMaterials(new ReadClient(auth, run), run, config.privateDir, faction);
          console.log(JSON.stringify({ faction, status: 'complete', ...summary }, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ faction, status: 'failed', error: safeFailure(error, 'faction material collection') }));
          process.exitCode = 1;
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
