import {MATERIALS} from './production-sync.mjs';

/**
 * Audit station-held inventory without inferring hub ownership.
 * Distinguish material piles in missing station exports from ordinary
 * unallocated piles held by known stations.
 */
export function auditStationContainers(materials,stations,productionSystems){
 const systems=new Set(productionSystems),known=new Map(),piles=new Map(),errors=[];
 for(const s of stations){
  if(!s.uid){errors.push({code:'station-without-uid'});continue}
  const old=known.get(s.uid);
  if(old && (old.system!==s.system||Number(old.sysX)!==Number(s.sysX)||Number(old.sysY)!==Number(s.sysY)))
   errors.push({code:'station-duplicate-conflict',uid:s.uid});
  else if(!old)known.set(s.uid,s);
 }
 for(const p of materials){
  if(!p.uid){errors.push({code:'pile-without-uid'});continue}
  const old=piles.get(p.uid);
  if(old){
   if([old.quantity,old.type_name,old.container_uid,old.system].join('|')!==[p.quantity,p.type_name,p.container_uid,p.system].join('|'))
    errors.push({code:'pile-duplicate-conflict',uid:p.uid});
   continue;
  }
  piles.set(p.uid,p);
 }
 const missing=new Map(),knownStation=new Map(),nonStation={piles:0,units:0},totals={piles:0,units:0};
 for(const p of piles.values()){
  if(!systems.has(p.system))continue;
  const qty=Number(p.quantity);
  if(!Number.isSafeInteger(qty)||qty<0){errors.push({code:'invalid-quantity',uid:p.uid});continue}
  if(!MATERIALS.includes(String(p.type_name).toLowerCase()))errors.push({code:'unknown-material',uid:p.uid,material:p.type_name});
  if(p.container_type_name!=='Stations'){nonStation.piles++;nonStation.units+=qty;continue}
  totals.piles++;totals.units+=qty;
  const s=known.get(p.container_uid);
  if(s && s.system!==p.system)errors.push({code:'station-system-mismatch',uid:p.uid,stationUid:p.container_uid});
  const collection=s?knownStation:missing;
  const key=[p.system,p.container_uid].join('|');
  let item=collection.get(key);
  if(!item){item={system:p.system,stationUid:p.container_uid,stationName:p.container_name||s?.name||'',stationType:s?.type_name||null,materialPiles:0,units:0,materials:{},pileIds:[]};collection.set(key,item)}
  item.materialPiles++;item.units+=qty;item.materials[p.type_name]=(item.materials[p.type_name]||0)+qty;item.pileIds.push(p.uid);
 }
 const sum=map=>[...map.values()].reduce((n,x)=>n+x.units,0);
 const missingUnits=sum(missing),knownUnits=sum(knownStation);
 if(knownUnits+missingUnits!==totals.units)errors.push({code:'conservation-failed',expected:totals.units,actual:knownUnits+missingUnits});
 return {schemaVersion:1,statistics:{uniquePiles:piles.size,uniqueStations:known.size,productionStationPiles:totals.piles,productionStationUnits:totals.units,knownStationUnits:knownUnits,missingStationUnits:missingUnits,missingStationPiles:[...missing.values()].reduce((n,x)=>n+x.materialPiles,0),missingStationCount:missing.size,productionNonStationPiles:nonStation.piles,productionNonStationUnits:nonStation.units},missingStationContainers:[...missing.values()].sort((a,b)=>b.units-a.units),knownStationContainers:[...knownStation.values()],errors};
}
