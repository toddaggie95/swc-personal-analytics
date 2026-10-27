// Compare audited station membership, actual live production orders, and legacy totals.
// This report is diagnostic; no spreadsheet writes.
export function auditOverviewCoverage({manifest,orders,legacyTotals={},stations=[]}) {
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
 const stationByUid=new Map(stations.map(s=>[s.uid,s]));
 const unmatched=[...seen].filter(uid=>!orderIds.has(uid)).map(uid=>({uid,type:stationByUid.get(uid)?.type_name??null,system:stationByUid.get(uid)?.system??null}));
 if(stations.length){
   for(const item of unmatched){
     if(!item.type)throw Error('Missing station type for unmatched audited member '+item.uid);
     if(/shipyard/i.test(item.type))throw Error('Unclassified audited shipyard '+item.uid);
   }
 }
 const trackedSystems=new Set(bySystem.keys());
 const allExportShipyards=stations.filter(s=>/shipyard/i.test(String(s.type_name??'')));
 const uncoveredShipyards=allExportShipyards.filter(s=>trackedSystems.has(s.system)&&!orderIds.has(s.uid)).map(s=>({uid:s.uid,system:s.system,type:s.type_name,owner:s.owner_name??s.owner??null}));
 const systems=[...bySystem.values()].sort((a,b)=>a.system.localeCompare(b.system)).map(r=>({
   ...r,manifestMinusOrders:r.memberStations-r.classifiedOrders,
   legacyMinusOrders:r.legacyTotal===null?null:r.legacyTotal-r.classifiedOrders
 }));
 return {mode:'read_only',systems,unmatchedMembers:unmatched,uncoveredShipyards,totals:{
   exportedShipyardsInTrackedSystems:allExportShipyards.filter(s=>trackedSystems.has(s.system)).length,
   uncoveredExportShipyardsInTrackedSystems:uncoveredShipyards.length,
   manifestMembers:systems.reduce((n,r)=>n+r.memberStations,0),
   classifiedOrders:orders.length,
   legacyTotal:systems.reduce((n,r)=>n+(r.legacyTotal??0),0),
   legacySystemsWithTotals:systems.filter(r=>r.legacyTotal!==null).length
 }};
}
