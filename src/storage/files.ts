import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafeError } from '../config/index.js';

export async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}
export async function atomicWrite(path: string, contents: string | Uint8Array): Promise<void> {
  await privateDirectory(dirname(path));
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
}
export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
export async function withLock<T>(directory: string, work: () => Promise<T>): Promise<T> {
  await privateDirectory(directory);
  const path = join(directory, 'operation.lock');
  const lock = await open(path, 'wx', 0o600).catch(() => {
    throw new SafeError('Private storage is locked. Close other runs; see security.md for stale-lock recovery.');
  });
  try { return await work(); } finally { await lock.close(); await rm(path, { force: true }); }
}
