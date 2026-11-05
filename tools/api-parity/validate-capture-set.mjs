// Fail-closed validation for the four read-only SWC API inventory captures.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const FACTIONS=['tff','tjo'];
export const KINDS=['stations','materials'];
export function validateCaptureSet(dir){
 const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));
 const expected=new Set();
 const counts={};
 const allUids=new Set();
 for(const faction of FACTIONS)for(const kind of KINDS){
  const prefix=faction+'__'+kind+'__system-kashyyyk__';
  const matching=files.filter(n=>n.startsWith(prefix));
  if(matching.length!==1)throw Error('Expected exactly one '+faction+' '+kind+' capture; found '+matching.length);
  const filename=matching[0];expected.add(filename);
  const doc=JSON.parse(fs.readFileSync(path.join(dir,filename),'utf8'));
  if(doc.summary?.locationFilter?.uid!=='9:104')throw Error('Wrong system: '+filename);
  const rows=doc[kind];
  if(!Array.isArray(rows))throw Error('Missing '+kind+' array: '+filename);
  const local=new Set();
  for(const row of rows){
   if(typeof row?.uid!=='string'||!row.uid)throw Error('Missing entity UID: '+filename);
   if(local.has(row.uid)||allUids.has(row.uid))throw Error('Duplicate entity UID: '+row.uid);
   local.add(row.uid);allUids.add(row.uid);
   if(row.location?.system?.uid!=='9:104')throw Error('Entity outside Kashyyyk: '+row.uid);
   if(kind==='materials'&&(!Number.isSafeInteger(row.quantity)||row.quantity<0))throw Error('Invalid material quantity: '+row.uid);
  }
  const declared=doc.summary?.[kind==='stations'?'ownedStations':'ownedMaterials'];
  if(typeof declared==='number'&&declared!==rows.length)throw Error('Capture count mismatch: '+filename);
  counts[faction+'_'+kind]=rows.length;
 }
 const extras=files.filter(n=>n.includes('__system-kashyyyk__')&&!expected.has(n));
 if(extras.length)throw Error('Unexpected API capture: '+extras.join(','));
 return {status:'validated',system:'Kashyyyk',counts,entities:allUids.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
 try{console.log(JSON.stringify(validateCaptureSet(process.argv[2]),null,2))}
 catch(e){console.error(e.message);process.exitCode=1}
}
