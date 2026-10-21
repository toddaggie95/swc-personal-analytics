import { SafeError } from '../config/index.js';
import { record } from '../swc/read-client.js';

export interface InventoryEntity {
  uid: string; entityType: 'stations' | 'ships'; name: string | null; typeUid: string | null; typeName: string | null;
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
export type Station = InventoryEntity & { entityType: 'stations' };
export function normalizeStation(value: unknown, ownerUid: string, run: string): Station {
  return { ...normalizeEntity(value, ownerUid, run, 'stations'), entityType: 'stations' };
}
export function normalizeEntity(value: unknown, ownerUid: string, run: string, entityType: InventoryEntity['entityType']): InventoryEntity {
  // Live inventory lists may wrap each entity as { attributes: { href }, value: {...} }.
  const entry = record(value);
  const v = entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value) ? record(entry.value) : entry;
  const type = record(v.type), coords = record(record(v.location).coordinates);
  const uid = text(v.uid);
  if (!uid || !/^\d+:\d+$/.test(uid)) throw new SafeError('Entity UID missing or invalid; snapshot is incomplete.');
  return { uid, entityType, name: text(v.name), typeUid: text(record(type.attributes).uid), typeName: text(type.value),
    ownerUid, observedAt: new Date().toISOString(), sourceRun: run,
    coordinates: { galaxy: point(coords.galaxy), system: point(coords.system), surface: point(coords.surface), ground: point(coords.ground) } };
}
