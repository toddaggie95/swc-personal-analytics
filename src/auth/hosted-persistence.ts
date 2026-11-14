import { spawn } from 'node:child_process';
import { SafeError } from '../config/index.js';

// Run before rotation: a hosted process must never acquire credentials it cannot save.
export function requireHostedWriter(): void {
  if (process.env.GITHUB_ACTIONS === 'true' &&
      (!process.env.SWC_SECRET_WRITER_TOKEN || !process.env.GITHUB_REPOSITORY)) {
    throw new SafeError('Hosted OAuth refresh requires durable secret-writer credentials. No refresh attempted.');
  }
}

export async function persistHostedToken(contents: string): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  requireHostedWriter();
  await new Promise<void>((resolve, reject) => {
    const child = spawn('gh', ['secret', 'set', 'SWC_OAUTH_TOKENS_JSON', '--repo',
      process.env.GITHUB_REPOSITORY!, '--env', 'swc-api-shadow'], {
      env: { ...process.env, GH_TOKEN: process.env.SWC_SECRET_WRITER_TOKEN },
      stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true,
    });
    const failed = () => reject(new SafeError('OAuth durable persistence failed. Stop hosted runs; recover the private token before runner cleanup.'));
    child.on('error', failed);
    child.stdin.on('error', failed);
    child.on('close', code => code === 0 ? resolve() : failed());
    child.stdin.end(contents);
  });
}
