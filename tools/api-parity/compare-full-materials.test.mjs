import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adapt,compareLots} from './compare-full-materials.mjs';
test('material adapter preserves zero, missing coordinates and container identity',()=>{
 const raw={uid:'12:1',entityType:'materials',quantity:0,typeName:'Quantum',ownerUid:'20:1174',location:{container:{uid:'5:1',type:'station'},system:{name:'Test',uid:'9:1'}},coordinates:{system:{x:0,y:-1}}};
 const row=adapt(raw);
 assert.equal(row.quantity,'0');assert.equal(row.sysX,'0');assert.equal(row.surfX,'');
 assert.equal(row.container_uid,'5:1');assert.equal(row.container_type_name,'Stations');
 assert.deepEqual(compareLots([row],[row]).issues,[]);
 assert.throws(()=>adapt({...raw,quantity:null}));
});
test('lot comparison distinguishes membership, quantity, container and missing coordinates',()=>{
 const row={uid:'12:1',quantity:'10',container_uid:'5:1',sysX:'0'};
 assert.deepEqual(compareLots([row],[{...row,quantity:'11',container_uid:'5:2',sysX:''}]).issues.map(x=>x.field),['quantity','container_uid','sysX']);
 assert.equal(compareLots([row],[]).issues[0].field,'presence');
 assert.throws(()=>compareLots([row,row],[]));
 assert.throws(()=>compareLots([],[row,row]));
});
