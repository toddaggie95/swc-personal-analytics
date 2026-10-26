import fs from 'node:fs';
import {csv} from './production-sync.mjs';

export function auditRegistry(stations,manifest,baseline=null){
 const current=new Map(),conflicts=[],assigned=new Map();
 for(const [owner,rows] of stations)for(const s of rows){
  if(!s.uid)throw Error('Station missing UID');
  const record={uid:s.uid,exportOwner:owner,name:s.name??'',type:s.type_name??'',system:s.system??'',sector:s.sector??'',x:s.sysX??'',y:s.sysY??'',owner:s.owner??s.owner_name??'',commander:s.commander??s.commander_name??'',tags:s.tags??s.tag??''};
  const old=current.get(s.uid);
  if(old&&JSON.stringify(old)!==JSON.stringify(record))conflicts.push({uid:s.uid,previous:old,current:record});
  else current.set(s.uid,record);
 }
 for(const d of manifest.destinations)for(const uid of d.memberStationUids??[]){
  if(assigned.has(uid))throw Error('Duplicate assignment '+uid);
  assigned.set(uid,d.id);
 }
 const records=[...current.values()].sort((a,b)=>a.uid.localeCompare(b.uid));
 const old=new Map((baseline?.stations??[]).map(s=>[s.uid,s]));
 const newStations=baseline?records.filter(s=>!old.has(s.uid)):[];
 const missingStations=baseline?[...old.values()].filter(s=>!current.has(s.uid)):[];
 const changedStations=baseline?records.flatMap(s=>{
  const previous=old.get(s.uid);if(!previous)return [];
  const fields=['exportOwner','name','type','system','sector','x','y','owner','commander','tags'];
  const changes=fields.filter(k=>String(s[k]??'')!==String(previous[k]??'')).map(k=>({field:k,before:previous[k]??'',after:s[k]??''}));
  return changes.length?[{uid:s.uid,changes,current:s}]:[];
 }):[];
 const unassigned=records.filter(s=>!assigned.has(s.uid));
 const tjoShipyards=records.filter(s=>s.exportOwner==='TJO'&&/shipyard/i.test(s.type));
 const untrackedTjoShipyards=tjoShipyards.filter(s=>!assigned.has(s.uid));
 const outsideTrackedSystems=untrackedTjoShipyards.filter(s=>/^(?:Deep Space|Asteroid Field)/i.test(s.system));
 const inTrackedSystems=untrackedTjoShipyards.filter(s=>!/^(?:Deep Space|Asteroid Field)/i.test(s.system));
 const assignedMissing=[...assigned].filter(([uid])=>!current.has(uid)).map(([uid,destination])=>({uid,destination}));
 return {schemaVersion:1,baselineStatus:baseline?'compared':'bootstrap_required',statistics:{exportedStations:records.length,assignedStations:assigned.size,unassignedStations:unassigned.length,tjoShipyards:tjoShipyards.length,untrackedTjoShipyards:untrackedTjoShipyards.length,untrackedTjoShipyardsInSystems:inTrackedSystems.length,untrackedTjoShipyardsExcludedSpace:outsideTrackedSystems.length,newStations:newStations.length,missingStations:missingStations.length,changedStations:changedStations.length,assignedMissing:assignedMissing.length,conflicts:conflicts.length},newStations,missingStations,changedStations,untrackedTjoShipyards,untrackedTjoShipyardsInSystems:inTrackedSystems,untrackedTjoShipyardsExcludedSpace:outsideTrackedSystems,assignedMissing,conflicts,unassignedStations:unassigned,bootstrapRegistry:{schemaVersion:1,source:'Approved TFF/TJO station export baseline; update only after review',stations:records}};
}
function main(){
 const a=process.argv.slice(2);if(a.length!==6)throw Error('Usage: node station-registry-audit.mjs tff-stations tjo-stations manifest baseline-or-dash report bootstrap');
 const [tff,tjo,manifestPath,baselinePath,reportPath,bootstrapPath]=a;
 const load=p=>csv(fs.readFileSync(p,'utf8'));
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const baseline=baselinePath==='-'?null:JSON.parse(fs.readFileSync(baselinePath,'utf8'));
 const result=auditRegistry([['TFF',load(tff)],['TJO',load(tjo)]],manifest,baseline);
 fs.writeFileSync(reportPath,JSON.stringify({...result,bootstrapRegistry:undefined},null,2)+'\n');
 fs.writeFileSync(bootstrapPath,JSON.stringify(result.bootstrapRegistry,null,2)+'\n');
 console.log(JSON.stringify({baselineStatus:result.baselineStatus,...result.statistics}));
}
if(process.argv[1]?.endsWith('station-registry-audit.mjs'))try{main()}catch(e){console.error(e);process.exitCode=1}
