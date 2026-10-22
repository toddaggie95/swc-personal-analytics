import {MATERIALS} from './production-sync.mjs';

/**
 * Audited destinations are disjoint allocations, never overlapping 3x3 guesses.
 * kind=hub: memberStationUids is the audited list of station containers.
 * kind=oneoff: stationUid is the exact shipyard UID.
 * All indices in target are zero-based Google Sheets coordinates.
 */
export function reconcileDestinations(materials, stations, destinations) {
 const errors=[],seen=new Map(),stationById=new Map(),allocations=new Map();
 for(const s of stations) {
  if(!s.uid) {errors.push({code:'station-missing-uid',station:s.name});continue}
  if(stationById.has(s.uid) && JSON.stringify(stationById.get(s.uid))!==JSON.stringify(s))
   errors.push({code:'conflicting-station',uid:s.uid});
  else stationById.set(s.uid,s);
 }
 const targets=new Set(),ids=new Set(),byStation=new Map();
 for(const d of destinations) {
  if(!d.id||ids.has(d.id))errors.push({code:'duplicate-or-missing-destination',id:d.id});
  ids.add(d.id);
  if(!['hub','oneoff','oneoff-group'].includes(d.kind))errors.push({code:'invalid-kind',id:d.id});
  const members=d.kind==='oneoff'?[d.stationUid]:d.memberStationUids;
  if(!Array.isArray(members)||!members.length||members.some(x=>!x))errors.push({code:'missing-members',id:d.id});
  if(d.kind==='oneoff-group' && Array.isArray(d.oneoffs)){
   const listed=d.oneoffs.map(o=>o.stationUid);
   if(listed.length!==(members||[]).length || listed.some(uid=>!(members||[]).includes(uid)))
    errors.push({code:'oneoff-membership-mismatch',id:d.id});
  }
  const t=d.target;
  if(!t||typeof t.sheet!=='string'||!Number.isInteger(t.hasColumn)||!Number.isInteger(t.materialStartRow)||t.hasColumn<0||t.materialStartRow<0)
   errors.push({code:'invalid-target',id:d.id});
  else {
   const key=[t.sheet,t.hasColumn,t.materialStartRow].join('|');
   if(targets.has(key))errors.push({code:'duplicate-target',id:d.id,target:key});
   targets.add(key);
  }
  for(const uid of members||[]) {
   const s=stationById.get(uid);
   if(!s)errors.push({code:'missing-station',id:d.id,uid});
   else if(s.system!==d.system || (d.sector&&s.sector!==d.sector))
    errors.push({code:'station-location-mismatch',id:d.id,uid});
   if(s && d.kind!=='hub' && !/shipyard/i.test(s.type_name||''))errors.push({code:'oneoff-not-shipyard',id:d.id,uid});
   if(s && d.kind==='oneoff-group' && Array.isArray(d.oneoffs)){
    const item=d.oneoffs.find(o=>o.stationUid===uid);
    const match=String(item?.coordinate||'').replaceAll('(','').replaceAll(')','').split(',').map(v=>v.trim());
    if(match.length!==2 || !match.every(v=>/^\d+$/.test(v)) || Number(s.sysX)!==Number(match[0]) || Number(s.sysY)!==Number(match[1]))
     errors.push({code:'oneoff-coordinate-mismatch',id:d.id,uid});
   }
   if(byStation.has(uid))errors.push({code:'station-double-assigned',uid,ids:[byStation.get(uid),d.id]});
   else byStation.set(uid,d.id);
  }
  allocations.set(d.id,{id:d.id,kind:d.kind,system:d.system,target:t,totals:Object.fromEntries(MATERIALS.map(m=>[m,0])),pileIds:[]});
 }
 const unallocated=[],nonStation=[],unknown=[];
 for(const p of materials) {
  const uid=p.uid,signature=[p.type_name,p.quantity,p.sector,p.system,p.sysX,p.sysY,p.container_type_name,p.container_uid].join('|');
  if(!uid){errors.push({code:'material-missing-uid'});continue}
  if(seen.has(uid)){if(seen.get(uid)!==signature)errors.push({code:'conflicting-pile',uid});continue}
  seen.set(uid,signature);
  const quantity=Number(p.quantity),material=p.type_name?.toLowerCase();
  if(!Number.isSafeInteger(quantity)||quantity<0){errors.push({code:'invalid-quantity',uid});continue}
  if(!MATERIALS.includes(material)){unknown.push({uid,material});errors.push({code:'unknown-material',uid,material});continue}
  if(p.container_type_name!=='Stations'){nonStation.push({uid,quantity,material,containerType:p.container_type_name});continue}
  const id=byStation.get(p.container_uid);
  if(!id){unallocated.push({uid,quantity,material,system:p.system,stationUid:p.container_uid,stationName:p.container_name});continue}
  const a=allocations.get(id);
  if(p.system!==a.system){errors.push({code:'pile-system-mismatch',uid,id});continue}
  a.totals[material]+=quantity;a.pileIds.push(uid);
 }
 const entries=[...allocations.values()];
 const total=entries.reduce((n,a)=>n+Object.values(a.totals).reduce((x,y)=>x+y,0),0);
 return {schemaVersion:2,materials:MATERIALS,destinations:entries,unallocated,nonStation,unknown,errors,statistics:{destinations:entries.length,uniquePiles:seen.size,allocatedUnits:total,unallocatedPiles:unallocated.length,errorCount:errors.length}};
}
/** Only HAS cells are eligible; no changes are emitted when any validation fails. */
export function planHasChanges(report,existing) {
 if(report.errors.length)throw Error('Refusing HAS plan: '+report.errors.length+' validation errors');
 const changes=[];
 for(const d of report.destinations) {
  const {sheet,hasColumn,materialStartRow}=d.target;
  for(let i=0;i<MATERIALS.length;i++){
   const row=materialStartRow+i,key=[sheet,row,hasColumn].join('|');
   if(!Object.hasOwn(existing,key))throw Error('Missing live baseline cell '+key);
   const current=existing[key],next=d.totals[MATERIALS[i]];
   if(!Number.isSafeInteger(current)||current<0)throw Error('Invalid baseline '+key);
   if(current!==next)changes.push({sheet,row,column:hasColumn,material:MATERIALS[i],from:current,to:next,destinationId:d.id});
  }
 }
 return changes;
}
