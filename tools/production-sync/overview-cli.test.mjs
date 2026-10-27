import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runSnapshotFiles} from './overview-cli.mjs';
test('offline CLI writes validated read-only snapshot from CSV files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swc-readiness-'));
 try{
  const write=(name,text)=>{const p=path.join(dir,name);fs.writeFileSync(p,text);return p;};
  const snapshot={manifest:{destinations:[{id:'hub',kind:'hub',title:'Hub (5,10)',center:{x:5,y:10},target:{sheet:'Eberon',hasColumn:2,materialStartRow:12},system:'Eberon',memberStationUids:['s1']}]},auditedOrders:[{destinationId:'hub',system:'Eberon',x:4,y:9,ship:'TIE/in Interceptor',row:2}],rowsBySystem:{Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','1','']]},shipRows:[['Ship type',...Array(28).fill(''),'Raw materials'],['TIE/in Interceptor',...Array(28).fill(''),'Meleenium: 10']]};
  const args={snapshot:write('snapshot.json',JSON.stringify(snapshot)),'tff-stations':write('tff-stations.csv','uid,system,sysX,sysY\ns1,Eberon,4,9\n'),'tjo-stations':write('tjo-stations.csv','uid,system,sysX,sysY\n'),'tff-materials':write('tff-materials.csv','uid,type_name,quantity,container_type_name,container_uid,system\np1,Meleenium,10,Stations,s1,Eberon\n'),'tjo-materials':write('tjo-materials.csv','uid,type_name,quantity,container_type_name,container_uid,system\n'),out:path.join(dir,'result.json')};
  const result=runSnapshotFiles(args);
  assert.equal(result.systems.Eberon.ready_now,1);
  assert.equal(JSON.parse(fs.readFileSync(args.out)).mode,'read_only');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
