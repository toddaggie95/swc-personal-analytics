import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decrypt} from './private-audit-envelope.mjs';

test('encrypted diagnostics retain partial progress and exclude OAuth storage',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swc-progress-'));
 try {
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const key=path.join(root,'public.pem'),output=path.join(root,'sealed.json');
  fs.writeFileSync(key,keys.publicKey.export({type:'spki',format:'pem'}));
  fs.mkdirSync(path.join(root,'collector-progress'));
  fs.writeFileSync(path.join(root,'collector-progress','stations.json'),JSON.stringify({stations:[{uid:'5:1',operations:{productionStateValidated:true}}]}));
  fs.mkdirSync(path.join(root,'swc-private'));
  fs.writeFileSync(path.join(root,'swc-private','tokens.json'),'PRIVATE_CREDENTIAL_SENTINEL');
  fs.writeFileSync(path.join(root,'tokens.json'),'PRIVATE_CREDENTIAL_SENTINEL');
  execFileSync(process.execPath,[fileURLToPath(new URL('./seal-sync-diagnostics.mjs',import.meta.url)),root,key,output]);
  const decoded=decrypt(JSON.parse(fs.readFileSync(output,'utf8')),keys.privateKey).toString();
  const capture=JSON.parse(decoded);
  assert.deepEqual(capture.files.map(f=>f.path),['collector-progress/stations.json']);
  assert.equal(JSON.parse(Buffer.from(capture.files[0].data,'base64')).stations[0].uid,'5:1');
  assert.equal(decoded.includes('PRIVATE_CREDENTIAL_SENTINEL'),false);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
