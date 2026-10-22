import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {run} from './audited-run.mjs';
test('audited CLI produces dry-run changes with no write path',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swc-audited-'));
 const save=(name,content)=>{const p=path.join(dir,name);fs.writeFileSync(p,content);return p};
 try {
  const station='uid,system,sector,sysX,sysY,type_name\n5:1,Kashyyyk,Mytaranor,5,10,Shipyard I\n';
  const materials='uid,type_name,quantity,system,sector,sysX,sysY,container_type_name,container_uid\n16:1,meleenium,7,Kashyyyk,Mytaranor,5,10,Stations,5:1\n';
  const config=[{id:'K-5,10',kind:'hub',system:'Kashyyyk',sector:'Mytaranor',memberStationUids:['5:1'],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:13}}];
  const baseline=Object.fromEntries(Array.from({length:21},(_,i)=>[['Kashyyyk',13+i,2].join('|'),0]));
  const out=path.join(dir,'report.json');
  run(['--config',save('config.json',JSON.stringify(config)),'--tff-materials',save('m.csv',materials),'--tjo-materials',save('empty-m.csv',materials.split('\n')[0]+'\n'),'--tff-stations',save('s.csv',station),'--tjo-stations',save('empty-s.csv',station.split('\n')[0]+'\n'),'--baseline',save('baseline.json',JSON.stringify(baseline)),'--out',out]);
  const report=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(report.errors.length,0);
  assert.equal(report.changes.length,1);
  assert.equal(report.changes[0].to,7);
  assert.equal(report.writeEnabled,false);
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
