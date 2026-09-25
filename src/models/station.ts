import { SafeError } from '../config/index.js';
import { record } from '../swc/read-client.js';

export interface Station {
  uid: string; entityType: 'stations'; name: string | null; typeUid: string | null; typeName: string | null;
  ownerUid: string; observedAt: string; sourceRun: string;
  coordinates: Record<'galaxy' | 'system' | 'surface' | 'ground', { x: number; y: number } | null>;
}
function text(v: unknown): string | null { return typeof v === 'string' && v.trim() ? v : null; }
function point(v: unknown): { x: number; y: number } | null {
  const p = record(record(v).attributes);
  const number = (n: unknown): number | null => (typeof n === 'number' || (typeof n === 'string' && n.trim() !== '')) && Number.isFinite(Number(n)) ? Number(n) : null;
  const x = number(p.x), y = number(p.y);
  return x === null || y === null ? null : { x, y };
}
export function normalizeStation(value: unknown, ownerUid: string, run: string): Station {
  const v = record(value), type = record(v.type), coords = record(record(v.location).coordinates);
  const uid = text(v.uid);
  if (!uid || !/^\d+:\d+$/.test(uid)) throw new SafeError('Station UID missing or invalid; snapshot is incomplete.');
  return { uid, entityType: 'stations', name: text(v.name), typeUid: text(record(type.attributes).uid), typeName: text(type.value),
    ownerUid, observedAt: new Date().toISOString(), sourceRun: run,
    coordinates: { galaxy: point(coords.galaxy), system: point(coords.system), surface: point(coords.surface), ground: point(coords.ground) } };
}
