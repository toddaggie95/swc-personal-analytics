import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPublicKey} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {encrypt,decrypt} from './private-audit-envelope.mjs';
import {canonicalRow} from './production-contract.mjs';
export const MAX_AGE_MS=2*60*60*1000;
const hash=value=>createHash('sha256').update(value).digest('hex');
export function planIdentity(stations,contract){
 const rows=stations.map(s=>[s.uid,s.ownerUid,s.typeName,s.location?.system?.uid,s.location?.system?.name]).sort((a,b)=>a[0].localeCompare(b[0]));
 if(new Set(rows.map(r=>r[0])).size!==rows.length)throw Error('Duplicate station plan');
 return hash(JSON.stringify({rows,contract:hash(contract)}));
}
export function newProgress(identity,now=Date.now()){return {version:1,identity,createdAt:new Date(now).toISOString(),entries:[]};}
export function validateProgress(progress,identity,stations,now=Date.now()){
 const created=Date.parse(progress?.createdAt);
 if(progress?.version!==1||progress.identity!==identity||!Number.isFinite(created)||created>now||now-created>MAX_AGE_MS||!Array.isArray(progress.entries))throw Error('Incompatible or stale production checkpoint');
 const targets=new Map(stations.map(s=>[s.uid,s])),seen=new Map();
 for(const entry of progress.entries){
  const target=targets.get(entry.uid),at=Date.parse(entry.operations?.observedAt);
  if(!target||target.ownerUid!==entry.ownerUid||seen.has(entry.uid)||!entry.operations?.productionStateValidated||!Number.isFinite(at)||at<created||at>now||now-at>MAX_AGE_MS)throw Error('Invalid production checkpoint entry');
  canonicalRow({...target,operations:entry.operations});
  seen.set(entry.uid,entry.operations);
 }
 return seen;
}
function main(){
 const [mode,input,output]=process.argv.slice(2);
 const key=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY;
 if(!key)throw Error('Checkpoint encryption key unavailable');
 if(mode==='seal'){
  if(!fs.existsSync(input))return;
  const payload=JSON.parse(fs.readFileSync(input,'utf8'));
  if(payload.version!==1||!Array.isArray(payload.entries))throw Error('Invalid progress payload');
  fs.writeFileSync(output,JSON.stringify(encrypt(Buffer.from(JSON.stringify(payload)),createPublicKey(key))),{mode:0o600});
 }else if(mode==='restore'){
  const payload=decrypt(JSON.parse(fs.readFileSync(input,'utf8')),key);
  fs.writeFileSync(output,payload,{mode:0o600});
 }else throw Error('Unknown checkpoint operation');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch{console.error('Production checkpoint operation failed; private details suppressed.');process.exitCode=1;}
