// Read-only station inventory adapter. Keeps each one-off station independent,
// even though the audited HAS workbook displays all one-offs as one aggregate.
import {MATERIALS} from './production-sync.mjs';
import {reconcileDestinations} from './audited-destinations.mjs';
export function buildReadinessPools(manifest, stations, materials) {
 const shared=reconcileDestinations(materials,stations,manifest.destinations);
 if(shared.errors.length)throw Error('Shared HAS inventory validation failed: '+JSON.stringify(shared.errors.slice(0,5)));
 const stationByUid=new Map();
 for(const s of stations){
  if(!s.uid)throw Error('Station missing UID');
  const previous=stationByUid.get(s.uid);
  if(previous && JSON.stringify(previous)!==JSON.stringify(s))throw Error('Conflicting station '+s.uid);
  stationByUid.set(s.uid,s);
 }
 const member=new Map(),pools=new Map();
 for(const d of manifest.destinations){
  if(!d.id || !d.system || !Array.isArray(d.memberStationUids))throw Error('Invalid destination');
  for(const uid of d.memberStationUids){
   if(member.has(uid))throw Error('Overlapping station membership '+uid);
   const s=stationByUid.get(uid);
   if(!s)throw Error('Missing audited station '+uid);
   if(s.system!==d.system)throw Error('System mismatch '+uid);
   // One-offs are physically separate local pools; other stations share hub.
   const destinationId=d.kind==='oneoff-group'?d.id+':'+uid:d.id;
   member.set(uid,{system:d.system,destinationId});
   pools.set(uid,{id:uid,system:d.system,destinationId,materials:{}});
  }
 }
 // Untracked owned orbital stations can supply transfers but are never local to a hub.
 for(const s of stationByUid.values())if(!member.has(s.uid)&&s.system&&!/^(?:Deep Space|Asteroid Field)/i.test(s.system)){
  const destinationId='external:'+s.uid;
  member.set(s.uid,{system:s.system,destinationId});
  pools.set(s.uid,{id:s.uid,system:s.system,destinationId,materials:{}});
 }
 const seen=new Map(),excluded={nonStation:0,untrackedStation:0},unassigned=[];
 for(const p of materials){
  if(!p.uid)throw Error('Pile missing UID');
  const sig=[p.type_name,p.quantity,p.system,p.container_type_name,p.container_uid,p.sysX,p.sysY].join('|');
  if(seen.has(p.uid)){if(seen.get(p.uid)!==sig)throw Error('Conflicting material pile '+p.uid);continue;}
  seen.set(p.uid,sig);
  if(p.container_type_name!=='Stations'){excluded.nonStation++;continue;}
  const loc=member.get(p.container_uid);
  if(!loc){excluded.untrackedStation++;unassigned.push(p.uid);continue;}
  if(p.system && p.system!==loc.system)throw Error('Material system mismatch '+p.uid);
  const m=String(p.type_name??'').toLowerCase(),q=Number(p.quantity);
  if(!MATERIALS.includes(m)||!Number.isSafeInteger(q)||q<0)throw Error('Invalid material '+p.uid);
  const target=pools.get(p.container_uid);
  target.materials[m]=(target.materials[m]??0)+q;
 }
 // Inventory conservation: shared HAS reconciliation is the authority for assigned totals.
 for(const d of shared.destinations){
  for(const [m,q] of Object.entries(d.totals)){
   const computed=[...pools.values()].filter(p=>p.destinationId===d.id || p.destinationId.startsWith(d.id+':')).reduce((n,p)=>n+(p.materials[m]??0),0);
   if(computed!==q)throw Error('Shared HAS parity mismatch '+d.id+' '+m+': '+computed+' vs '+q);
  }
 }
 return {pools:[...pools.values()],statistics:{stations:pools.size,uniquePiles:seen.size,excluded,unassignedStationPileIds:unassigned,sharedHasParity:'passed',transferOnlyStations:[...pools.values()].filter(p=>p.destinationId.startsWith('external:')).length}};
}
