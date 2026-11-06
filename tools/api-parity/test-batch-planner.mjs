import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'swc-plan-test-'));
try {
 const input=join(dir,'inventory.json'),output=join(dir,'plan.json');
 const tff=Array.from({length:1346},(_,i)=>String(100000+i));
 const tjo=Array.from({length:1029},(_,i)=>String(200000+i));
 writeFileSync(input,JSON.stringify({factions:{tff,tjo}}));
 execFileSync(process.execPath,['tools/api-parity/plan-station-batches.mjs',input,output],{env:{...process.env,BATCH_SIZE:'50'}});
 const plan=JSON.parse(readFileSync(output,'utf8'));
 assert.equal(plan.totalStations,2375);
 assert.equal(plan.batchCount,48);
 assert.equal(plan.batches.filter(b=>b.faction==='tff').length,27);
 assert.equal(plan.batches.filter(b=>b.faction==='tjo').length,21);
 assert.equal(plan.batches.reduce((sum,b)=>sum+b.expected,0),2375);
 assert.equal(new Set(plan.batches.flatMap(b=>b.uids)).size,2375);
 assert.equal(plan.batches.at(-1).expected,29);
 console.log('PASS: 2375 stations partition into 48 complete, unique batches');
 writeFileSync(input,JSON.stringify({factions:{tff:[...tff,tff[0]],tjo}}));
 assert.throws(()=>execFileSync(process.execPath,['tools/api-parity/plan-station-batches.mjs',input,output],{stdio:'pipe'}));
 console.log('PASS: duplicate inventory UIDs rejected');
} finally {rmSync(dir,{recursive:true,force:true});}
