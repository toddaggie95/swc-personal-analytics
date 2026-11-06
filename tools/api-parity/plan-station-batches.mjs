import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
// Accepts an inventory manifest: {factions:{tff:[uids...],tjo:[uids...]}}.
// The manifest is read-only input; batches contain explicit UIDs, never unstable offsets.
const input=process.argv[2],output=process.argv[3]||'/tmp/station-plan/plan.json';
if(!input)throw Error('Usage: node plan-station-batches.mjs <inventory.json> [output.json]');
const size=Number(process.env.BATCH_SIZE||50);
if(!Number.isInteger(size)||size<1||size>100)throw Error('BATCH_SIZE must be 1..100');
const manifest=JSON.parse(readFileSync(input,'utf8'));
const batches=[],counts={};
for(const faction of ['tff','tjo']){
 const uids=manifest.factions?.[faction];
 if(!Array.isArray(uids))throw Error('Missing inventory for '+faction);
 const ids=uids.map(String);
 if(ids.some(id=>!/^(?:\d+:)?\d+$/.test(id)))throw Error('Invalid station UID in '+faction);
 if(new Set(ids).size!==ids.length)throw Error('Duplicate station UID in '+faction);
 ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
 counts[faction]=ids.length;
 for(let start=0;start<ids.length;start+=size){
  const subset=ids.slice(start,start+size);
  batches.push({id:`${faction}-${String(start/size).padStart(3,'0')}`,faction,uids:subset,expected:subset.length});
 }
}
const plan={version:1,batchSize:size,counts,totalStations:counts.tff+counts.tjo,batchCount:batches.length,batches};
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(plan,null,2));
console.log('PLAN_SUMMARY '+JSON.stringify({counts,totalStations:plan.totalStations,batchCount:plan.batchCount,batchSize:size}));
