// Pure, read-only comparison of accepted production snapshots.
// Station identity is the exported UID, never its coordinates or row number.
export const FIELDS=['system','coordinates','owner','ship','quantity','started','status','readiness'];
export function compareProductionSnapshots(previous,current){
 if(!Array.isArray(previous?.stations)||!Array.isArray(current?.stations))throw Error('Both snapshots require stations arrays');
 const index=(rows,label)=>{const m=new Map();for(const s of rows){const uid=String(s.uid??'').trim();if(!uid||m.has(uid))throw Error(label+' has missing or duplicate station UID: '+uid);m.set(uid,s);}return m;};
 const before=index(previous.stations,'previous'),after=index(current.stations,'current'),changes=[];
 for(const uid of [...new Set([...before.keys(),...after.keys()])].sort()){
  const a=before.get(uid),b=after.get(uid);
  if(!a||!b){changes.push({uid,type:a?'station_removed':'station_added',before:a??null,after:b??null});continue;}
  for(const field of FIELDS){
   const oldValue=a[field]??null,newValue=b[field]??null;
   if(oldValue===newValue)continue;
   const type=field==='started'?'production_activity_changed':field==='ship'?'assignment_changed':field==='readiness'?'readiness_changed':field==='status'?'status_changed':field+'_changed';
   changes.push({uid,system:b.system??a.system,type,field,before:oldValue,after:newValue});
  }
 }
 return {previousBatch:previous.batchId??null,currentBatch:current.batchId??null,previousCount:before.size,currentCount:after.size,changes,summary:Object.fromEntries([...new Set(changes.map(c=>c.type))].sort().map(type=>[type,changes.filter(c=>c.type===type).length]))};
}
