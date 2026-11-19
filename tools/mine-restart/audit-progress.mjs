import {createHash} from 'node:crypto';

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const CATEGORIES = new Set([
  'depleted', 'do-not-restart', 'paused-no-mine-space', 'paused-with-space-candidate',
  'already-running', 'other-excluded', 'manual-review',
]);

export function minePlanIdentity(system, mines, allowlist, classifierSource) {
  const seen = new Set();
  const rows = mines.map(mine => {
    if (seen.has(mine.uid)) throw Error('Duplicate mine in owner inventories.');
    seen.add(mine.uid);
    return [mine.uid, mine.ownerUid, mine.systemUid];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify([system, rows, allowlist, classifierSource])).digest('hex');
}

export function restoreMineProgress(checkpoint, identity, mines, now = Date.now()) {
  const start = Date.parse(checkpoint?.observedFrom);
  if (checkpoint?.version !== 1 || checkpoint.identity !== identity || !Array.isArray(checkpoint.entries) ||
      !Number.isFinite(start) || start > now || now - start > MAX_AGE_MS) {
    throw Error('Mine checkpoint is stale or its scope, inventory, or eligibility rules changed.');
  }
  const expected = new Map(mines.map(mine => [mine.uid, mine]));
  const restored = new Map();
  for (const row of checkpoint.entries) {
    const listed = expected.get(row.uid);
    const observed = Date.parse(row.observedAt);
    if (!listed || listed.ownerUid !== row.ownerUid || listed.systemUid !== row.systemUid ||
        restored.has(row.uid) || row.detailsUnavailable || !CATEGORIES.has(row.category) ||
        !Number.isFinite(observed) || observed < start || observed > now) {
      throw Error('Invalid observation in mine checkpoint.');
    }
    restored.set(row.uid, row);
  }
  return restored;
}
