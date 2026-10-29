// Pure, read-only comparison of accepted production snapshots.
// Station identity is the exported UID, never its coordinates or row number.
export const FIELDS=['system','owner','ship','quantity','started','status','readiness'];
export function compareProductionSnapshots(previous,current){
 if(!Array.isArray(previous?.stations)||!Array.isArray(current?.stations))throw Error('Both snapshots require stations arrays');
 const index=(rows,label)=>{const m=new Map();for(const s of rows){const uid=String(s.uid??'').trim();if(!uid||m.has(uid))throw Error(label+' has missing or duplicate station UID: '+uid);m.set(uid,s);}return m;};
 const before=index(previous.stations,'previous'),after=index(current.stations,'current'),changes=[];
 for(const uid of [...new Set([...before.keys(),...after.keys()])].sort()){
  const a=before.get(uid),b=after.get(uid);
  if(!a||!b){changes.push({uid,type:a?'station_removed':'station_added',before:a??null,after:b??null,sector:b?.sector??a?.sector??null,coordinates:b?.coordinates??a?.coordinates??null});continue;}
  for(const field of FIELDS){
   const oldValue=a[field]??null,newValue=b[field]??null;
   if(oldValue===newValue)continue;
   const type=field==='started'?'production_activity_changed':field==='ship'?'assignment_changed':field==='readiness'?'readiness_changed':field==='status'?'status_changed':field+'_changed';
   changes.push({uid,system:b.system??a.system,sector:b.sector??a.sector??null,coordinates:b.coordinates??a.coordinates??null,type,field,before:oldValue,after:newValue});
  }
 }
 return {previousBatch:previous.batchId??null,currentBatch:current.batchId??null,previousCount:before.size,currentCount:after.size,changes,summary:Object.fromEntries([...new Set(changes.map(c=>c.type))].sort().map(type=>[type,changes.filter(c=>c.type===type).length]))};
}

/**
 * Presentation projection: exactly one notice per station UID, with every
 * underlying field change preserved. Raw events remain authoritative for
 * notification counts and machine-readable reports.
 */
export function groupProductionChangesByStation(report){
 if(!Array.isArray(report?.changes))throw Error('Change report requires changes array');
 const grouped=new Map();
 for(const change of report.changes){
  const uid=String(change.uid??'').trim();
  if(!uid)throw Error('Change missing station UID');
  let record=grouped.get(uid);
  if(!record){record={uid,system:change.system??change.after?.system??change.before?.system??'',changes:[],fields:{}};grouped.set(uid,record);}
  if(change.system && record.system && change.system!==record.system)throw Error('Conflicting station systems '+uid);
  if(!record.system&&change.system)record.system=change.system;
  record.changes.push(change);
  if(change.field){
   if(record.fields[change.field])throw Error('Duplicate station field change '+uid+' '+change.field);
   record.fields[change.field]={before:change.before,after:change.after};
  }
 }
 const classify=record=>{
  const start=record.fields.started;
  if(start?.before===false&&start?.after===true)return 'Production Started';
  if(start?.before===true&&start?.after===false)return 'Production Stopped';
  if(record.changes.some(c=>c.type==='station_added'))return 'Station Added';
  if(record.changes.some(c=>c.type==='station_removed'))return 'Station Removed';
  if(record.fields.ship||record.fields.quantity)return 'Assignment Changed';
  if(record.fields.readiness)return 'Readiness Changed';
  return 'Station Updated';
 };
 return [...grouped.values()].map(r=>({...r,notice:classify(r),changedFields:r.changes.map(c=>c.field??c.type)}))
  .sort((a,b)=>a.system.localeCompare(b.system)||a.uid.localeCompare(b.uid));
}
