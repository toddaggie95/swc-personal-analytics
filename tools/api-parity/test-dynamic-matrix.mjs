import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'swc-matrix-'));
try {
 const input=join(dir,'inventory.json'),plan=join(dir,'plan.json'),out=join(dir,'github-output');
 writeFileSync(input,JSON.stringify({factions:{tff:Array.from({length:1346},(_,i)=>String(100000+i)),tjo:Array.from({length:1029},(_,i)=>String(200000+i))}}));
 execFileSync(process.execPath,['tools/api-parity/plan-station-batches.mjs',input,plan]);
 execFileSync(process.execPath,['tools/api-parity/build-matrix-from-plan.mjs',plan,out]);
 const line=readFileSync(out,'utf8').trim();
 const matrix=JSON.parse(line.slice('matrix='.length));
 assert.equal(matrix.include.length,48);
 assert.equal(matrix.include.reduce((n,b)=>n+b.expected,0),2375);
 assert.equal(new Set(matrix.include.map(b=>b.id)).size,48);
 console.log('PASS: dynamic matrix covers 2375 stations across 48 unique jobs');
}finally{rmSync(dir,{recursive:true,force:true});}
