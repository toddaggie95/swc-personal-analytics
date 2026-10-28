// Pure, presentation-ready system totals. No Sheets access or writes.
export const READINESS_STATUSES = ['building','ready_now','transfer','blocked','unassigned'];
export function summarizeReadiness(orders, systems = []) {
  const result = new Map(systems.map(system => [system, Object.fromEntries([...READINESS_STATUSES.map(k=>[k,0]),['total',0]])]));
  const seen = new Set();
  for (const order of orders) {
    if (!order.id || seen.has(order.id)) throw Error('Duplicate or missing readiness order ID');
    seen.add(order.id);
    if (!order.system || !READINESS_STATUSES.includes(order.status)) throw Error('Invalid readiness order');
    if (!result.has(order.system)) result.set(order.system,Object.fromEntries([...READINESS_STATUSES.map(k=>[k,0]),['total',0]]));
    const counts = result.get(order.system);
    counts[order.status]++;
    counts.total++;
  }
  const rows = [...result].sort(([a],[b])=>a.localeCompare(b)).map(([system,counts])=>({system,...counts}));
  const totals = Object.fromEntries([...READINESS_STATUSES.map(k=>[k,0]),['total',0]]);
  for (const row of rows) for (const key of [...READINESS_STATUSES,'total']) totals[key] += row[key];
  if (READINESS_STATUSES.reduce((n,k)=>n+totals[k],0)!==totals.total) throw Error('Readiness totals mismatch');
  return {columns:['System','Running','Ready Now','Ready w/ Material Move','Blocked','Unassigned','Total'],rows,totals};
}
