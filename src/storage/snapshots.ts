import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { atomicWrite } from './files.js';

export class SnapshotRun {
  readonly id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  readonly directory: string;
  private sequence = 0;
  constructor(root: string) { this.directory = join(root, 'raw', this.id); }
  async capture(body: Uint8Array, request: { endpoint: string; query: Record<string, number> }, status: number, contentType: string | null): Promise<string> {
    const id = String(++this.sequence).padStart(5, '0');
    await atomicWrite(join(this.directory, `${id}.body`), body);
    await atomicWrite(join(this.directory, `${id}.meta.json`), JSON.stringify({
      schemaVersion: 1, retrievedAt: new Date().toISOString(), method: 'GET', ...request,
      status, contentType, bodyFile: `${id}.body`, sha256: createHash('sha256').update(body).digest('hex'),
    }, null, 2));
    return id;
  }
  async complete(summary: unknown): Promise<void> {
    await atomicWrite(join(this.directory, 'complete.json'), JSON.stringify(summary, null, 2));
  }
}
