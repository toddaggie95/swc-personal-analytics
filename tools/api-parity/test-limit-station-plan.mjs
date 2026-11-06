import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swc-cap-'));
try{
 const file=path.join(dir,'plan.json');
 const original={version:1,batchCount:3,totalStations:120,counts:{tff:100,tjo:20},batches:[{id:'tff-000',faction:'tff',expected:50,uids:Array(50).fill('1')},{id:'tff-001',faction:'tff',expected:50,uids:Array(50).fill('2')},{id:'tjo-000',faction:'tjo',expected:20,uids:Array(20).fill('3')}]};
 for(const [cap,count,stations] of [['1',1,50],['4',3,120],['0',3,120]]){
  fs.writeFileSync(file,JSON.stringify(original));
  execFileSync(process.execPath,['tools/api-parity/limit-station-plan.mjs',file,cap]);
  const plan=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(plan.batchCount,count);
  assert.equal(plan.totalStations,stations);
  assert.equal(plan.batches.length,count);
 }
 console.log('PASS: bounded plan 1, 4 and all');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
