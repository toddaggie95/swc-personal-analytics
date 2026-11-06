import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=mkdtempSync(join(tmpdir(),'swc-manifest-'));
try {
 const plan=join(root,'plan.json'),batches=join(root,'batches'),out=join(root,'out.json');
 mkdirSync(batches);
 const manifest={version:1,batchCount:2,batches:[{id:'tff-000',faction:'tff',uids:['101','102'],expected:2},{id:'tjo-000',faction:'tjo',uids:['201'],expected:1}]};
 writeFileSync(plan,JSON.stringify(manifest));
 const write=(offset,faction,ids)=>writeFileSync(join(batches,`station-audit-${offset}.json`),JSON.stringify({faction,offset,errors:0,rows:ids.map(uid=>({uid,detailRead:'ok'}))}));
 const check=()=>spawnSync(process.execPath,['tools/api-parity/validate-station-manifest.mjs',plan,batches,out],{encoding:'utf8'});
 write(0,'tff',['101','102']);write(50,'tjo',['201']);
 assert.equal(check().status,0,'Valid manifest must pass');
 write(50,'tjo',['999']);
 assert.notEqual(check().status,0,'Unexpected and missing stations must fail');
 write(50,'tjo',['201','201']);
 assert.notEqual(check().status,0,'Duplicate stations must fail');
 console.log('PASS: manifest coverage, missing/unexpected IDs, and duplicates');
}finally{rmSync(root,{recursive:true,force:true});}
