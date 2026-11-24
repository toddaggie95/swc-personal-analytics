// A snapshot-scoped manifest shared by all production consumers. Never edit the audited registry.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {csv} from './production-sync.mjs';
const ids={TFF:'20:1174',TJO:'20:1838'};
const names={TFF:'The Faerytail Family',TJO:'The Faerytail Family: The Je`daii Order'};
const shipyard=s=>/shipyard/i.test(String(s.type_name??''));
const integer=v=>/^(0|[1-9]\d*)$/.test(String(v??''))&&Number.isSafeInteger(Number(v));
const inside=(s,d)=>s.system===d.system&&integer(s.sysX)&&integer(s.sysY)&&Math.abs(Number(s.sysX)-d.center.x)<=1&&Math.abs(Number(s.sysY)-d.center.y)<=1;
export function resolveHubMembership(manifest,owned,source){
 if(!['api','csv'].includes(source))throw Error('Unknown membership source');
 const resolved=structuredClone(manifest),stations=new Map(),assigned=new Map(),discovered=[];
 const hubs=resolved.destinations.filter(d=>d.kind==='hub');
 const tracked=new Set(resolved.destinations.map(d=>d.system));
 for(const d of hubs)if(!integer(d.center?.x)||!integer(d.center?.y))throw Error('Invalid hub center '+d.id);
 for(const [owner,rows] of owned){
  if(!Object.hasOwn(ids,owner))throw Error('Unrecognized station export owner');
  for(const s of rows){
   if(!s.uid||stations.has(s.uid))throw Error('Missing or duplicate station UID '+s.uid);
   stations.set(s.uid,{s,owner});
  }
 }
 function validate(s,owner){
  if(!/^5:\d+$/.test(s.uid)||!integer(s.sysX)||!integer(s.sysY)||!String(s.type_name??'').trim())throw Error('Invalid hub station UID, coordinates or type '+s.uid);
  if(source==='api'?s.owner_uid!==ids[owner]:(s.owner_uid?s.owner_uid!==ids[owner]:s.owner_name!==names[owner]))throw Error('Station owner mismatch '+s.uid);
 }
 function construction(s,d,existing){
  if(!shipyard(s))return;
  const markers=d.underConstructionStationUids??=[];
  if(source==='api'){
   if(!['true','false'].includes(String(s.underConstruction)))throw Error('Missing authoritative API construction status '+s.uid);
   d.underConstructionStationUids=markers.filter(u=>u!==s.uid);
   if(String(s.underConstruction)==='true'){
    if(s.productionStatus==='running')throw Error('Construction conflicts with running production '+s.uid);
    d.underConstructionStationUids.push(s.uid);
   }
  }else if(!existing)throw Error('New shipyard requires API construction status '+s.uid);
 }
 for(const d of resolved.destinations){
  for(const uid of d.memberStationUids??[]){
   if(assigned.has(uid))throw Error('Station assigned twice '+uid);
   assigned.set(uid,d.id);
   const entry=stations.get(uid);
   if(!entry)throw Error('Stations missing from exports: '+uid);
   const {s,owner}=entry;
   if(s.system!==d.system)throw Error('Station system mismatch '+uid);
   validate(s,owner);
   if(d.kind==='hub'&&!inside(s,d))throw Error('Registered hub station outside geometry '+uid);
   construction(s,d,true);
  }
 }
 // Explicit membership wins for existing audited exceptions. Do not silently move
 // old non-production stations (defense, R&D, depots) into production pools.
 for(const {s,owner} of stations.values()){
  if(assigned.has(s.uid)||!shipyard(s)||!tracked.has(s.system))continue;
  validate(s,owner);
  const candidates=hubs.filter(d=>inside(s,d));
  if(candidates.length>1)throw Error('Ambiguous overlapping hubs for '+s.uid+': '+candidates.map(d=>d.id).join(', '));
  if(!candidates.length)continue; // downstream coverage remains strict
  const d=candidates[0];
  if(d.memberStationUids.some(uid=>{const other=stations.get(uid).s;return Number(other.sysX)===Number(s.sysX)&&Number(other.sysY)===Number(s.sysY)}))throw Error('Occupied hub coordinate '+s.uid+' in '+d.id);
  construction(s,d,false);
  d.memberStationUids.push(s.uid);assigned.set(s.uid,d.id);
  discovered.push({uid:s.uid,system:s.system,x:Number(s.sysX),y:Number(s.sysY),type:s.type_name,owner,destinationId:d.id,underConstruction:String(s.underConstruction)==='true'});
 }
 discovered.sort((a,b)=>a.uid.localeCompare(b.uid));
 return {manifest:resolved,discovered};
}
function main(){
 const [manifest,tff,tjo,sourceFile,out]=process.argv.slice(2);
 if(!out)throw Error('Usage: hub-membership.mjs manifest tff-stations tjo-stations export-manifest output');
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 const load=f=>csv(fs.readFileSync(f,'utf8'));
 const result=resolveHubMembership(read(manifest),[['TFF',load(tff)],['TJO',load(tjo)]],read(sourceFile).source??'csv');
 fs.writeFileSync(out,JSON.stringify(result.manifest,null,2)+'\n');
 console.log('HUB_MEMBERSHIP '+JSON.stringify({newlyDiscovered:result.discovered.length,stations:result.discovered}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main()}catch(e){console.error(e.message);process.exitCode=1}
