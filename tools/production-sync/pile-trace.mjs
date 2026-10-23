import fs from 'node:fs';
import {csv} from './production-sync.mjs';
const [comparisonPath,manifestPath,tffStations,tjoStations,tffMaterials,tjoMaterials,out]=process.argv.slice(2);
if(!out)throw Error('Usage: node pile-trace.mjs comparison manifest tffStations tjoStations tffMaterials tjoMaterials out');
const load=p=>csv(fs.readFileSync(p,'utf8'));
const comparison=JSON.parse(fs.readFileSync(comparisonPath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const stations=new Map();
for(const [owner,rows] of [['TFF',load(tffStations)],['TJO',load(tjoStations)]])for(const s of rows){
 const prior=stations.get(s.uid);
 if(prior&&JSON.stringify(prior.row)!==JSON.stringify(s))throw Error('Conflicting station '+s.uid);
 stations.set(s.uid,{owner,row:s});
}
const piles=new Map();
for(const [owner,rows] of [['TFF',load(tffMaterials)],['TJO',load(tjoMaterials)]])for(const p of rows){
 const prior=piles.get(p.uid);
 if(prior){for(const k of ['type_name','quantity','container_uid','system','sysX','sysY'])if(String(prior.row[k]??'')!==String(p[k]??''))throw Error('Conflicting pile '+p.uid);prior.owners.add(owner)}
 else piles.set(p.uid,{row:p,owners:new Set([owner])});
}
const byDestination=new Map(manifest.destinations.map(d=>[d.id,d]));
const stationPiles=new Map();
for(const [uid,{row,owners}] of piles){
 if(!stationPiles.has(row.container_uid))stationPiles.set(row.container_uid,[]);
 stationPiles.get(row.container_uid).push({pileUid:uid,material:String(row.type_name).toLowerCase(),quantity:Number(row.quantity),exportOwners:[...owners],containerUid:row.container_uid,containerName:row.container_name??'',system:row.system,sysX:row.sysX,sysY:row.sysY});
}
const traces=comparison.differences.map(diff=>{
 const d=byDestination.get(diff.destination);
 if(!d)throw Error('Unknown destination '+diff.destination);
 const members=d.memberStationUids.map(uid=>{
  const s=stations.get(uid);if(!s)throw Error('Missing station '+uid);
  const relevant=(stationPiles.get(uid)||[]).filter(p=>p.material===diff.material);
  return {stationUid:uid,stationName:s.row.name??s.row.Name??s.row.entity_name??'',stationExportOwner:s.owner,stationSystem:s.row.system,sysX:s.row.sysX,sysY:s.row.sysY,stationTag:s.row.tags??s.row.tag??'',piles:relevant,quantity:relevant.reduce((n,p)=>n+p.quantity,0)};
 });
 const sum=members.reduce((n,s)=>n+s.quantity,0);
 if(sum!==diff.proposed)throw Error('Trace does not reconcile '+diff.destination+' '+diff.material+' '+sum+' vs '+diff.proposed);
 return {...diff,destinationTitle:d.title,center:d.center,stations:members.filter(s=>s.piles.length),stationMembership:d.memberStationUids,traceQuantity:sum,zeroPileCount:members.filter(s=>!s.piles.length).length};
});
const assigned=new Set(manifest.destinations.flatMap(d=>d.memberStationUids));
const unassigned=[];
for(const [uid,s] of stations)if(!assigned.has(uid)){
 const ps=stationPiles.get(uid)||[];
 if(ps.length)unassigned.push({stationUid:uid,stationName:s.row.name??s.row.Name??'',system:s.row.system,sysX:s.row.sysX,sysY:s.row.sysY,tag:s.row.tags??s.row.tag??'',exportOwner:s.owner,pileCount:ps.length,totalQuantity:ps.reduce((n,p)=>n+p.quantity,0),piles:ps});
}
const report={schemaVersion:1,statistics:{differences:traces.length,unassignedStationContainers:unassigned.length,unassignedStationPiles:unassigned.reduce((n,s)=>n+s.pileCount,0)},traces,unassignedStations:unassigned};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.statistics));
