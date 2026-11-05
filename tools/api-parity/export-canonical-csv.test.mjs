import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildCanonical} from './export-canonical-csv.mjs';
import {csv} from '../production-sync/production-sync.mjs';
const names=['tff-stations','tff-materials','tjo-stations','tjo-materials'];
const owner={tff:'The Faerytail Family',tjo:'The Faerytail Family: The Je`daii Order'};
test('canonical adapter produces four source-marked datasets and stable identity',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swc-api-export-'));
 try{
  for(const dir of ['api','reference','out'])fs.mkdirSync(path.join(root,dir));
  for(const name of names){
   const [f,k]=name.split('-');
   const station=k==='stations';
   const header=station?'uid,name,owner_name,type_name,system,sysX,sysY,tooled-to':'uid,name,owner_name,type_name,system,sysX,sysY,quantity,container_type_name,container_uid';
   fs.writeFileSync(path.join(root,'reference',name+'.csv'),header+'\n');
   const row={uid:(station?'3:':'16:')+(f==='tff'?'11':'22'),name:'Example',typeName:station?'Shipyard':'Meleenium',ownerUid:f,location:{sector:{name:'Mytaranor',uid:'sec'},system:{name:'Test System',uid:'sys'},container:{type:'station',uid:'3:11'}},coordinates:{system:{x:1,y:2}},quantity:station?undefined:100,operations:station?{tooledTo:{value:'Example'},productionActions:[]}:undefined};
   fs.writeFileSync(path.join(root,'api',f+'__'+k+'__system-test.json'),JSON.stringify({summary:{locationFilter:{uid:'sys',name:'Test System'}},[k]:[row]}));
  }
  const options={apiDir:path.join(root,'api'),referenceDir:path.join(root,'reference'),outDir:path.join(root,'out'),systems:['Test System']};
  const first=buildCanonical(options);
  assert.equal(first.source,'api');assert.equal(first.files.length,4);
  assert.equal(buildCanonical(options).snapshotId,first.snapshotId);
  for(const name of names){
   const rows=csv(fs.readFileSync(path.join(root,'out',name+'.csv'),'utf8'));
   assert.equal(rows.length,1);
   assert.equal(rows[0].owner_name,owner[name.split('-')[0]]);
  }
  assert.throws(()=>buildCanonical({...options,systems:['Test System','Missing']}),/Missing/);
  const template=path.join(root,'reference','tff-materials.csv');
  fs.writeFileSync(template,fs.readFileSync(template,'utf8').trimEnd()+',unmapped-field\\n');
  assert.throws(()=>buildCanonical(options),/Unmapped canonical columns/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
