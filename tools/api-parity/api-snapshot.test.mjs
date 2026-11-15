import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {sealSnapshot,restoreSnapshot} from './api-snapshot.mjs';
test('downstream restores exact API inputs and rejects changed bytes or CSV substitution',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swc-accepted-api-'));
 try{
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const files=[];
  for(const owner of ['tff','tjo'])for(const kind of ['stations','materials']){
   const name=owner+'-'+kind+'.csv',data='uid,name\nfixture,Example\n';
   fs.writeFileSync(path.join(root,name),data);
   const sha256=createHash('sha256').update(data).digest('hex');
   files.push({canonicalName:name,sha256,id:'api:'+name.replace('.csv','')+':'+sha256});
  }
  const manifest={schemaVersion:1,source:'api',files};
  fs.writeFileSync(path.join(root,'export-manifest.json'),JSON.stringify(manifest));
  const envelope=sealSnapshot(root,keys.publicKey),out=path.join(root,'restored');
  assert.deepEqual(restoreSnapshot(envelope,keys.privateKey,out),manifest);
  assert.equal(fs.readFileSync(path.join(out,'tff-stations.csv'),'utf8'),'uid,name\nfixture,Example\n');
  fs.appendFileSync(path.join(root,'tff-stations.csv'),'changed');
  assert.throws(()=>sealSnapshot(root,keys.publicKey),/hash\/identity/);
  fs.writeFileSync(path.join(root,'export-manifest.json'),JSON.stringify({...manifest,source:'csv'}));
  assert.throws(()=>sealSnapshot(root,keys.publicKey),/Invalid API/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
