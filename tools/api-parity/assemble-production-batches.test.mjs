import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {makePlan} from './production-batches.mjs';
import {encrypt,decrypt} from './private-audit-envelope.mjs';
import {restoreSnapshot} from './api-snapshot.mjs';
import {csv} from '../production-sync/production-sync.mjs';
test('encrypted batch assembly restores four exact canonical datasets and retains partial failures',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swc-batch-cli-'));
 try{
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const now=Date.now(),documents=[];
  for(const [faction,id,owner] of [['tff',11,'20:1174'],['tjo',22,'20:1838']])for(const kind of ['stations','materials']){
   const row={entityType:kind,uid:(kind==='stations'?'5:':'16:')+id,name:'Fixture',ownerUid:owner,typeName:kind==='stations'?'Shipyard I':'Meleenium',quantity:kind==='materials'?100:undefined,location:{sector:{name:'Sector',uid:'10:1'},system:{name:'Test',uid:'9:1'},container:{type:'station',uid:'5:'+id}},coordinates:{system:{x:0,y:1}}};
   documents.push({faction,name:faction+'__'+kind+'__all__fixture.json',doc:{summary:{entityType:kind,ownerUid:owner},[kind]:[row]}});
  }
  const plan=makePlan(documents,['Test'],fs.readFileSync(new URL('./production-contract.mjs',import.meta.url)),null,now);
  const batch=plan.batches[0],entries=batch.stations.map(s=>({uid:s.uid,ownerUid:s.ownerUid,operations:{productionStateValidated:true,productionStatus:s.ownerUid==='20:1174'?'running':'',productionQuantity:s.ownerUid==='20:1174'?'48':'',tooledTo:'Fixture Ship',observedAt:new Date().toISOString()}}));
  const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(encrypt(Buffer.from(JSON.stringify(value)),keys.publicKey)));
  const planFile=path.join(root,'plan.encrypted.json'),batchDir=path.join(root,'batches');fs.mkdirSync(batchDir);save(planFile,plan);
  const resultFile=path.join(batchDir,'batch-000.encrypted.json');save(resultFile,{id:batch.id,identity:plan.identity,entries});
  const invoke=out=>spawnSync(process.execPath,[fileURLToPath(new URL('./assemble-production-batches.mjs',import.meta.url)),planFile,batchDir,out],{env:{...process.env,SWC_API_SNAPSHOT_PRIVATE_KEY:keys.privateKey},encoding:'utf8'});
  const out=path.join(root,'out');const success=invoke(out);assert.equal(success.status,0,success.stderr);
  const restored=path.join(root,'restored');restoreSnapshot(JSON.parse(fs.readFileSync(path.join(out,'api-inputs.encrypted.json'),'utf8')),keys.privateKey,restored);
  const rows=csv(fs.readFileSync(path.join(restored,'tff-stations.csv'),'utf8'));assert.equal(rows[0].productionQuantity,'48');assert.equal(rows[0].sysX,'0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(restored,'export-manifest.json'))).files.length,4);
  save(resultFile,{id:batch.id,identity:plan.identity,entries:entries.slice(0,1)});
  const partial=path.join(root,'partial');assert.notEqual(invoke(partial).status,0);
  assert.equal(fs.existsSync(path.join(partial,'api-inputs.encrypted.json')),false);
  const retained=JSON.parse(decrypt(JSON.parse(fs.readFileSync(path.join(partial,'production-progress.encrypted.json'),'utf8')),keys.privateKey));assert.equal(retained.entries.length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
