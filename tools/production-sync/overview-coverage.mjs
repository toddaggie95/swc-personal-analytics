// Compare audited station membership, actual live production orders, and legacy totals.
// This report is diagnostic; no spreadsheet writes.
export function auditOverviewCoverage({manifest,orders,legacyTotals={}}) {
 const bySystem=new Map();
 const row=system=>{if(!bySystem.has(system))bySystem.set(system,{system,memberStations:0,classifiedOrders:0,legacyTotal:legacyTotals[system]??null});return bySystem.get(system)};
 const seen=new Set();
 for(const d of manifest.destinations){
   const r=row(d.system);
   for(const uid of d.memberStationUids??[]){
     if(seen.has(uid))throw Error('Duplicate manifest station '+uid);
     seen.add(uid);r.memberStations++;
   }
 }
 const orderIds=new Set();
 for(const o of orders){
   if(!o.id||orderIds.has(o.id))throw Error('Duplicate order');
   orderIds.add(o.id);row(o.system).classifiedOrders++;
 }
 const systems=[...bySystem.values()].sort((a,b)=>a.system.localeCompare(b.system)).map(r=>({
   ...r,manifestMinusOrders:r.memberStations-r.classifiedOrders,
   legacyMinusOrders:r.legacyTotal===null?null:r.legacyTotal-r.classifiedOrders
 }));
 return {mode:'read_only',systems,totals:{
   manifestMembers:systems.reduce((n,r)=>n+r.memberStations,0),
   classifiedOrders:orders.length,
   legacyTotal:systems.reduce((n,r)=>n+(r.legacyTotal??0),0),
   legacySystemsWithTotals:systems.filter(r=>r.legacyTotal!==null).length
 }};
}
