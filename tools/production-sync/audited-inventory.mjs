import fs from 'node:fs';
import {csv,MATERIALS} from './production-sync.mjs';

export function buildLedger(manifest,stations,materials){
 const destinations=manifest.destinations;
 if(!Array.isArray(destinations)||!destinations.length)throw Error('Missing destinations');
 const owners=new Map(), stationById=new Map(), piles=new Map();
 for(const s of stations){
  if(!s.uid)throw Error('Station missing UID');
  const prior=stationById.get(s.uid);
  if(prior && (prior.system!==s.system||prior.sysX!==s.sysX||prior.sysY!==s.sysY))throw Error('Conflicting station '+s.uid);
  stationById.set(s.uid,s);
 }
 const missingStations=[];
 for(const d of destinations){
  if(!d.id||!d.system||!d.target||!Number.isInteger(d.target.hasColumn)||!Number.isInteger(d.target.materialStartRow)||!d.memberStationUids?.length)throw Error('Incomplete destination '+d.id);
  for(const uid of d.memberStationUids){
   if(owners.has(uid))throw Error('Station assigned twice: '+uid);
   const s=stationById.get(uid);
   if(!s){missingStations.push({uid,system:d.system,destination:d.id,title:d.title??null});continue;}
   if(s.system!==d.system)throw Error('Station system mismatch: '+uid+' expected '+d.system+' got '+s.system);
   owners.set(uid,d.id);
  }
 }
 if(missingStations.length){const error=Error('Stations missing from exports: '+missingStations.length+' (first: '+missingStations[0].uid+')');error.diagnostics={status:'blocked',reason:'missing_stations',missingStations};throw error;}
 const byId=new Map(destinations.map(d=>[d.id,{id:d.id,system:d.system,target:d.target,totals:Object.fromEntries(MATERIALS.map(m=>[m,0])),pileCount:0}]));
 const unassigned=[];
 for(const p of materials){
  if(!p.uid)throw Error('Material missing UID');
  const prior=piles.get(p.uid);
  if(prior){
   for(const key of ['type_name','quantity','container_uid','system','sysX','sysY'])if(String(prior[key]??'')!==String(p[key]??''))throw Error('Conflicting pile '+p.uid+' field '+key);
   continue;
  }
  piles.set(p.uid,p);
  const q=Number(p.quantity),material=String(p.type_name||'').toLowerCase();
  if(!Number.isSafeInteger(q)||q<0)throw Error('Invalid quantity '+p.uid);
  if(!MATERIALS.includes(material))throw Error('Unknown material '+p.uid+' '+material);
  const destination=owners.get(p.container_uid);
  if(!destination){if(p.container_type_name==='Stations')unassigned.push({uid:p.uid,container_uid:p.container_uid,system:p.system,material,quantity:q});continue}
  const s=stationById.get(p.container_uid);
  if(p.system && p.system!==s.system)throw Error('Pile/station system mismatch '+p.uid);
  byId.get(destination).totals[material]+=q;
  byId.get(destination).pileCount++;
 }
 const cells=[],seen=new Set();
 for(const d of byId.values())for(let i=0;i<MATERIALS.length;i++){
  const cell=d.target.sheet+'!'+d.target.hasColumn+':'+(d.target.materialStartRow+i);
  if(seen.has(cell))throw Error('Duplicate HAS target '+cell);
  seen.add(cell);
  cells.push({destination:d.id,sheet:d.target.sheet,columnIndex:d.target.hasColumn,rowIndex:d.target.materialStartRow+i,material:MATERIALS[i],quantity:d.totals[MATERIALS[i]]});
 }
 return {schemaVersion:1,statistics:{destinations:destinations.length,stations:stationById.size,assignedStations:owners.size,uniquePiles:piles.size,unassignedStationPiles:unassigned.length,hasCells:cells.length},destinations:[...byId.values()],cells,unassigned};
}
function main(args){
 const opt={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected --key value');opt[args[i].slice(2)]=args[i+1]}
 for(const k of ['tff-materials','tjo-materials','tff-stations','tjo-stations','manifest','out'])if(!opt[k])throw Error('Missing --'+k);
 const load=k=>csv(fs.readFileSync(opt[k],'utf8'));
 const result=buildLedger(JSON.parse(fs.readFileSync(opt.manifest,'utf8')),[...load('tff-stations'),...load('tjo-stations')],[...load('tff-materials'),...load('tjo-materials')]);
 fs.writeFileSync(opt.out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.statistics));
}
if(process.argv[1]?.endsWith('audited-inventory.mjs'))try{main(process.argv.slice(2))}catch(e){console.error(e.message);if(e.diagnostics){console.error(JSON.stringify(e.diagnostics,null,2));const args=process.argv.slice(2),i=args.indexOf('--out');if(i>=0&&args[i+1])fs.writeFileSync(args[i+1],JSON.stringify(e.diagnostics,null,2)+'\n');}process.exitCode=1}
