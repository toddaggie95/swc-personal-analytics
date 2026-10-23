import fs from 'node:fs';
import {csv} from './production-sync.mjs';

/**
 * Audit material piles held in stations other than shipyards, and piles
 * referencing station UIDs absent from the supplied station exports.
 * These must never be silently allocated by proximity.
 */
export function auditNonShipyardInventory(materials,stations) {
 const byStation=new Map();
 for(const s of stations)if(s.uid&&!byStation.has(s.uid))byStation.set(s.uid,s);
 const unique=new Map(),errors=[];
 for(const p of materials){
  if(!p.uid){errors.push({code:'missing-pile-uid'});continue}
  if(unique.has(p.uid)){
   const q=unique.get(p.uid);
   if([p.quantity,p.type_name,p.container_uid].join('|')!==[q.quantity,q.type_name,q.container_uid].join('|'))
    errors.push({code:'conflicting-pile',uid:p.uid});
   continue;
  }
  unique.set(p.uid,p);
 }
 const groups=new Map(),missing=[];
 for(const p of unique.values()){
  if(p.container_type_name!=='Stations')continue;
  const s=byStation.get(p.container_uid),qty=Number(p.quantity);
  if(!Number.isSafeInteger(qty)||qty<0){errors.push({code:'invalid-quantity',uid:p.uid});continue}
  if(!s){missing.push({pileUid:p.uid,stationUid:p.container_uid,system:p.system,material:p.type_name,quantity:qty});continue}
  if(/shipyard/i.test(s.type_name||''))continue;
  const key=s.uid;
  if(!groups.has(key))groups.set(key,{uid:s.uid,system:s.system,sector:s.sector,x:Number(s.sysX),y:Number(s.sysY),name:s.name,type:s.type_name,tags:s.tags||'',piles:0,units:0,materials:{},pileUids:[]});
  const g=groups.get(key);g.piles++;g.units+=qty;g.materials[p.type_name]=(g.materials[p.type_name]||0)+qty;g.pileUids.push(p.uid);
 }
 const stationsWithInventory=[...groups.values()].sort((a,b)=>b.units-a.units);
 return {schemaVersion:1,status:'REVIEW_REQUIRED',stationsWithInventory,missingStationReferences:missing,errors,statistics:{
  nonShipyardStations:stationsWithInventory.length,nonShipyardPiles:stationsWithInventory.reduce((n,s)=>n+s.piles,0),
  nonShipyardUnits:stationsWithInventory.reduce((n,s)=>n+s.units,0),missingStationPiles:missing.length,
  missingStationUnits:missing.reduce((n,p)=>n+p.quantity,0)}};
}
export function run(argv){
 const o={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('Expected --flag value pairs');o[argv[i].slice(2)]=argv[i+1]}
 for(const k of ['tff-materials','tjo-materials','tff-stations','tjo-stations','out'])if(!o[k])throw Error('Missing --'+k);
 const load=k=>csv(fs.readFileSync(o[k],'utf8'));
 const r=auditNonShipyardInventory([...load('tff-materials'),...load('tjo-materials')],[...load('tff-stations'),...load('tjo-stations')]);
 fs.writeFileSync(o.out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r.statistics));
 if(r.errors.length)process.exitCode=2;
}
if(process.argv[1]?.endsWith('audit-depot-inventory.mjs'))try{run(process.argv.slice(2))}catch(e){console.error(e.message);process.exitCode=1}
