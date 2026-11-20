const allowedInfotext = new Set([
  'transfer',
  'messert ii npc cargo transport',
  'lexrul iii npc transport',
]);

const normalizeInfotext = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function summarizeUnfamiliarInfotext(mines) {
  const notes = new Map();
  for (const mine of mines) {
    const key = normalizeInfotext(mine.infotext);
    if (!key || allowedInfotext.has(key)) continue;
    if (!notes.has(key)) notes.set(key, {infotext: mine.infotext.trim(), mines: []});
    notes.get(key).mines.push({uid: mine.uid, ownerUid: mine.ownerUid, system: mine.system, category: mine.category});
  }
  return [...notes.values()].sort((a, b) => a.infotext.localeCompare(b.infotext));
}

export function classifyMine(listed, e, allowlist) {
  const excluded = [], review = [];
  const norm = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const action = e.actions?.action?.length === 1 && Array.isArray(e.actions.action) ? e.actions.action[0] : null;
  const status = norm(action?.value?.status);
  const mining = [action?.attributes?.type, action?.value?.actiontype].some(v => ['mine', 'mining'].includes(norm(v)));
  if (mining && ['running', 'active', 'in progress', 'mining'].includes(status)) excluded.push('mining already running');
  else if (!mining || !['paused', 'mining paused'].includes(status) || !positive(action?.attributes?.id)) review.push('single paused mining action unverified');
  const deposits = e.deposits?.deposit;
  const deposit = Array.isArray(deposits) && deposits.length === 1 ? deposits[0] : null;
  const material = norm(deposit?.value), quantity = deposit?.attributes?.quantity;
  const emptyDepositList = Array.isArray(deposits) && deposits.length === 0;
  const depleted = emptyDepositList || quantity === 0;
  const depositState = emptyDepositList ? 'explicitly-empty' : quantity === 0 ? 'zero-quantity'
    : positive(quantity) ? 'positive-quantity' : 'unverified';
  const expectedYield = action?.value?.['expected-yield'];
  const volume = e.cargo?.volumecapacity;
  if (!material && !depleted) review.push('single deposit material unverified');
  else if (material && !allowlist.includes(material)) excluded.push('material outside current allowlist');
  if (depleted) excluded.push(emptyDepositList ? 'SWC reports an empty deposit list' : 'deposit depleted');
  else if (!positive(quantity) || !positive(expectedYield) || quantity < expectedYield) review.push('deposit sufficient for next cycle unverified');
  if (volume?.remaining === 0 && Number.isFinite(volume?.total) && volume.total > 0) {
    review.push('mine cargo reports zero free volume; linked storage unverified');
  } else if (!positive(expectedYield) || !Number.isFinite(volume?.remaining) ||
      !Number.isFinite(volume?.total) || volume.remaining > volume.total || volume.remaining < expectedYield) {
    review.push('mine storage for next cycle unverified; linked storage not counted');
  }
  if (expectedYield === 0 && action?.value?.['expected-cost'] === 0) {
    review.push('SWC reports zero expected yield and zero expected cost');
  }
  if (norm(e.ispowered) === 'no' || norm(e.underconstruction) === 'yes' || norm(e.wrecked) === 'yes') excluded.push('facility unpowered, incomplete or wrecked');
  else if (norm(e.ispowered) !== 'yes' || norm(e.underconstruction) !== 'no' || norm(e.wrecked) !== 'no') review.push('facility condition unverified');
  const tags = e.tags?.tag;
  const notes = [e.name, e.infotext, ...(Array.isArray(tags) ? tags.map(t => t?.value ?? t) : [])];
  const hold = /\b(?:do not|don['’]?t|never)\s+(?:resume|restart|start|mine)|\b(?:hold|reserved|leave (?:off|paused)|no mining)\b/i;
  if (notes.some(v => hold.test(norm(v).replace(/[_-]+/g, ' ')))) excluded.push('explicit hold notation');
  const depletionNotation = notes.some(v => /\bdepleted\b/.test(norm(v).replace(/[_-]+/g, ' ')));
  if (!depleted && depletionNotation && quantity == null) excluded.push('depletion notation with no API deposit quantity');
  else if (!depleted && depletionNotation) {
    review.push('depletion notation conflicts with or is unverified by the deposit reading');
  }
  const infotext = normalizeInfotext(e.infotext);
  if (typeof e.infotext !== 'string' || (infotext && !allowedInfotext.has(infotext)) || !Array.isArray(tags) || tags.length) {
    review.push('annotations require review');
  }
  if (!/^1:\d+$/.test(e.pilot?.attributes?.uid ?? '') || !positive(action?.value?.workers) ||
      !positive(action?.value?.['expected-cost'])) review.push('operator, workers or expected cost unverified');
  const paused = mining && ['paused', 'mining paused'].includes(status) && positive(action?.attributes?.id);
  const classification = excluded.length ? 'excluded' : review.length ? 'manual-review' : 'candidate';
  const category = excluded.includes('explicit hold notation') ? 'do-not-restart'
    : depleted ? 'depleted'
    : depletionNotation && quantity == null ? 'reported-depleted'
    : excluded.includes('mining already running') ? 'already-running'
    : excluded.length ? 'other-excluded'
    : paused && (volume?.remaining === 0 || (positive(expectedYield) && Number.isFinite(volume?.remaining) && volume.remaining >= 0 && volume.remaining < expectedYield)) ? 'paused-no-mine-space'
    : classification === 'candidate' ? 'paused-with-space-candidate' : 'manual-review';
  return {uid: listed.uid, ownerUid: listed.ownerUid, name: e.name, planet: e.location?.planet?.value,
    city: e.location?.city?.value, material, quantity, depositState, expectedYield, remainingVolume: volume?.remaining,
    expectedCost: action?.value?.['expected-cost'], status, infotext: e.infotext, tags,
    classification, category,
    reasons: [...excluded, ...review]};
}
