import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planIdentity,newProgress,validateProgress,validateFreshness,MAX_AGE_MS} from './production-progress.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const now=Date.now(),stations=[{uid:'5:1',ownerUid:'20:1',typeName:'Shipyard I',location:{system:{uid:'9:1',name:'Test'}}}];
const identity=planIdentity(stations,'contract');
const entry={uid:'5:1',ownerUid:'20:1',operations:{productionStateValidated:true,productionStatus:'',productionQuantity:'',tooledTo:'',observedAt:new Date(now).toISOString()}};
test('compatible partial progress restores exact validated UID without new detail reads',()=>{
 const p={...newProgress(identity,now),entries:[entry]};assert.equal(validateProgress(p,identity,stations,now).size,1);
 assert.equal(validateProgress(newProgress(identity,now),identity,stations,now).size,0);
});
test('changed plan, contract, owner, duplicates and stale progress fail closed',()=>{
 const p={...newProgress(identity,now),entries:[entry]};
 assert.notEqual(planIdentity(stations,'new-contract'),identity);
 assert.throws(()=>validateProgress(p,'changed-plan',stations,now));
 assert.throws(()=>validateProgress(p,identity,stations,now+MAX_AGE_MS+1));
 assert.throws(()=>validateProgress({...p,entries:[entry,entry]},identity,stations,now));
 assert.throws(()=>validateProgress(p,identity,[{...stations[0],ownerUid:'20:2'}],now));
 assert.throws(()=>validateProgress({...p,entries:[{...entry,operations:{...entry.operations,observedAt:'bad'}}]},identity,stations,now));
 assert.throws(()=>validateProgress({...p,entries:[{...entry,operations:{...entry.operations,productionStatus:'running',productionQuantity:'0'}}]},identity,stations,now));
});
test('freshness is enforced at the exact boundary and can expire after collection',()=>{
 const p={...newProgress(identity,now),entries:[entry]};
 assert.doesNotThrow(()=>validateFreshness(p,now+MAX_AGE_MS));
 assert.throws(()=>validateFreshness(p,now+MAX_AGE_MS+1));
 assert.throws(()=>validateFreshness(p,now-1));
});
test('checkpoint CLI encrypts and restores exact data, rejecting tampered ciphertext',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swc-resume-'));
 try {
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const input=path.join(root,'progress.json'),sealed=path.join(root,'progress.encrypted.json'),restored=path.join(root,'restored.json');
  const progress={...newProgress(identity,now),entries:[entry]};fs.writeFileSync(input,JSON.stringify(progress));
  const invoke=(mode,a,b)=>spawnSync(process.execPath,[fileURLToPath(new URL('./production-progress.mjs',import.meta.url)),mode,a,b],{env:{...process.env,SWC_API_SNAPSHOT_PRIVATE_KEY:privateKey},encoding:'utf8'});
  assert.equal(invoke('seal',input,sealed).status,0);
  assert.equal(fs.readFileSync(sealed,'utf8').includes('ownerUid'),false);
  assert.equal(invoke('restore',sealed,restored).status,0);
  assert.deepEqual(JSON.parse(fs.readFileSync(restored,'utf8')),progress);
  const damaged=JSON.parse(fs.readFileSync(sealed,'utf8'));damaged.data='AAAA'+damaged.data.slice(4);fs.writeFileSync(sealed,JSON.stringify(damaged));
  assert.notEqual(invoke('restore',sealed,path.join(root,'invalid.json')).status,0);
  assert.equal(fs.existsSync(path.join(root,'invalid.json')),false);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
