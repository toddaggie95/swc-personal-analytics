// Production readiness allocation core. Pure functions: no spreadsheet or SWC writes.
// A "ready now" start can draw from any station in its assigned 3x3 hub.
// One-offs use their own station as their local pool.
const copy = value => structuredClone(value);
function canCover(pool, bill) {
  return Object.entries(bill).every(([m,q]) => Number.isSafeInteger(q) && q >= 0 && (pool[m] ?? 0) >= q);
}
function validateBill(bill) {
  if (!bill || !Object.keys(bill).length || Object.entries(bill).some(([m,q]) => !m || !Number.isSafeInteger(q) || q < 0)) throw Error('Invalid production bill');
}
export function allocateReadiness({pools,orders,priority = () => 1}) {
  // Pools are station-container-level material totals, each belonging to exactly one system and destination.
  const poolById = new Map(), initial = new Map();
  for (const p of pools) {
    if (!p.id || !p.system || !p.destinationId || poolById.has(p.id)) throw Error('Duplicate or incomplete pool');
    for (const q of Object.values(p.materials)) if (!Number.isSafeInteger(q) || q < 0) throw Error('Invalid inventory');
    poolById.set(p.id,copy(p)); initial.set(p.id,copy(p.materials));
  }
  const seen = new Set(), result = [], reservations = [];
  const candidates = orders.filter(o => {
    if (!o.id || seen.has(o.id)) throw Error('Duplicate or missing order ID');
    seen.add(o.id);
    if (!o.system || !o.destinationId || !o.stationPoolId) throw Error('Incomplete order');
    if (o.started && o.ship === 'None') throw Error('Started station has no ship assignment '+o.id);
    if (o.started || !o.ship || o.ship === 'None') { result.push({...o,status:o.started?'building':'unassigned'}); return false; }
    validateBill(o.bill);
    const home=poolById.get(o.stationPoolId);
    if (!home || home.system!==o.system || home.destinationId!==o.destinationId) throw Error('Order station mapping mismatch '+o.id);
    return true;
  }).sort((a,b)=>priority(a)-priority(b)||a.id.localeCompare(b.id));
  // Priority is strict across tiers: a lower-priority local order must not
  // consume material that would enable a higher-priority transfer order.
  const tiers=[...new Set(candidates.map(priority))].sort((a,b)=>a-b);
  for (const tier of tiers) {
   const tierPending=[];
   for (const o of candidates.filter(x=>priority(x)===tier)) {
    const local=[...poolById.values()].filter(p=>p.system===o.system && p.destinationId===o.destinationId);
    const totals={};for(const p of local)for(const [m,q] of Object.entries(p.materials))totals[m]=(totals[m]??0)+q;
    if(canCover(totals,o.bill))reserve(o,local,'ready_now');else tierPending.push(o);
   }
   for (const o of tierPending) {
    const available=[...poolById.values()].filter(p=>p.system===o.system);
    const totals={};for(const p of available)for(const [m,q] of Object.entries(p.materials))totals[m]=(totals[m]??0)+q;
    if(canCover(totals,o.bill))reserve(o,available,'transfer');else result.push({...o,status:'blocked',shortfall:Object.fromEntries(Object.entries(o.bill).map(([m,q])=>[m,Math.max(0,q-(totals[m]??0))]).filter(([,q])=>q>0))});
   }
  }
  function reserve(o, sources, status) {
    for(const [material,required] of Object.entries(o.bill)){
      let remaining=required;
      // Use local destination inventory first, then deterministic station order.
      const sorted=[...sources].sort((a,b)=>(a.destinationId===o.destinationId?0:1)-(b.destinationId===o.destinationId?0:1)||a.id.localeCompare(b.id));
      for(const p of sorted){if(!remaining)break;const take=Math.min(remaining,p.materials[material]??0);if(!take)continue;
        p.materials[material]-=take;remaining-=take;reservations.push({orderId:o.id,sourcePoolId:p.id,sourceDestinationId:p.destinationId,targetDestinationId:o.destinationId,material,quantity:take});
      }
      if(remaining)throw Error('Internal allocation failure');
    }
    result.push({...o,status});
  }
  // Invariant: no inventory can be allocated more than physically present in its station.
  const spent=new Map();
  for(const r of reservations){const key=r.sourcePoolId+'|'+r.material;spent.set(key,(spent.get(key)??0)+r.quantity);}
  for(const [id,mats] of initial)for(const [m,q] of Object.entries(mats))if((spent.get(id+'|'+m)??0)>q)throw Error('Inventory double counted '+id+' '+m);
  return {orders:result.sort((a,b)=>a.id.localeCompare(b.id)),reservations,remainingPools:[...poolById.values()]};
}
