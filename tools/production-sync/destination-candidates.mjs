import fs from 'node:fs';
import {csv} from './production-sync.mjs';

/**
 * Generate a review queue from workbook destinations and station exports.
 * Proximity is a CANDIDATE signal, never proof of ownership.
 * This tool does not populate memberStationUids or modify the workbook.
 */
export function candidateMembership(layout,stations) {
 const destinations=layout.destinations||layout;
 const hubs=destinations.filter(d=>d.kind==='hub'),oneoffs=destinations.filter(d=>d.kind==='oneoff-group'||d.kind==='oneoff');
 const exactOneoffIds=new Set(oneoffs.flatMap(d=>d.memberStationUids||[d.stationUid]).filter(Boolean));
 const unique=new Map(),conflicts=[];
 for(const s of stations) {
  if(!s.uid)continue;
  if(unique.has(s.uid)) {
   const p=unique.get(s.uid);
   if([p.system,p.sysX,p.sysY,p.type_name].join('|')!==[s.system,s.sysX,s.sysY,s.type_name].join('|'))conflicts.push(s.uid);
  }else unique.set(s.uid,s);
 }
 const byHub=hubs.map(h=>({...h,candidateStationUids:[],candidateShipyardUids:[],ambiguousStationUids:[]}));
 const stationMatches=new Map();
 for(const s of unique.values()) {
  if(exactOneoffIds.has(s.uid))continue;
  const x=Number(s.sysX),y=Number(s.sysY);
  if(!Number.isInteger(x)||!Number.isInteger(y))continue;
  const hits=byHub.filter(h=>h.system===s.system&&(!h.sector||h.sector===s.sector)&&h.center&&Math.abs(h.center.x-x)<=1&&Math.abs(h.center.y-y)<=1);
  if(!hits.length)continue;
  stationMatches.set(s.uid,hits.map(h=>h.id));
  for(const h of hits) {
   h.candidateStationUids.push(s.uid);
   if(/shipyard/i.test(s.type_name||''))h.candidateShipyardUids.push(s.uid);
   if(hits.length>1)h.ambiguousStationUids.push(s.uid);
  }
 }
 for(const h of byHub){h.candidateStationDetails=h.candidateStationUids.map(uid=>{const s=unique.get(uid);return {uid,name:s.name,type:s.type_name,coordinate:[Number(s.sysX),Number(s.sysY)],tags:s.tags||'',tooledTo:s['tooled-to']||'',productionStatus:s.productionStatus||'',candidateHubIds:stationMatches.get(uid)||[]}})}
 const unresolved=byHub.filter(h=>h.ambiguousStationUids.length||!h.candidateShipyardUids.length);
 return {schemaVersion:1,warning:'CANDIDATES ONLY. Require explicit UID membership review before HAS writes.',hubCandidates:byHub,oneoffs,conflictingStationUids:conflicts,statistics:{hubs:hubs.length,oneoffGroups:oneoffs.length,ambiguousHubs:unresolved.length,uniqueStations:unique.size}};
}
export function run(args) {
 const options={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--'))throw Error('Expected --flag');options[args[i].slice(2)]=args[i+1]}
 for(const k of ['layout','tff-stations','tjo-stations','out'])if(!options[k])throw Error('Missing --'+k);
 const load=k=>csv(fs.readFileSync(options[k],'utf8'));
 const layout=JSON.parse(fs.readFileSync(options.layout,'utf8'));
 const result=candidateMembership(layout,[...load('tff-stations'),...load('tjo-stations')]);
 fs.writeFileSync(options.out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.statistics));
 if(result.conflictingStationUids.length)process.exitCode=2;
}
if(process.argv[1]?.endsWith('destination-candidates.mjs'))try{run(process.argv.slice(2))}catch(e){console.error(e.message);process.exitCode=1}
