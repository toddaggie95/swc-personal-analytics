import test from'node:test';import assert from'node:assert/strict';import{hash}from'./planet-capture.mjs';import{makeResourcePlan,collectResourceBatch,assembleResources}from'./fleet-resources.mjs';
const ref=uid=>({attributes:{uid},value:'Synthetic'});function fixture(){const i={status:'complete',inventories:[{kind:'facilities',ownerUid:'20:1',status:'complete',rows:[{uid:'4:1',location:{planet:ref('8:1')}}]}]};i.contentSha256=hash(i);return i;}
test('public resources are identity-checked and missing workers remain named gaps',async()=>{
 const plan=makeResourcePlan(fixture(),{phase:'planets',runId:'test',analysisPublicKey:'key'});
 const b=await collectResourceBatch(async()=>({status:200,source:{id:'a'},body:{swcapi:{planet:{uid:'8:1',name:'Synthetic'}}}}),plan,'resource-000',async()=>{});assert.equal(assembleResources(plan,[b]).entries[0].status,'observed');assert.equal(assembleResources(plan,[]).entries[0].status,'not_observed');
});
test('a foreign city denial is retained while invalid public-resource credentials stop the batch',async()=>{
 const inventory=fixture(),plan=makeResourcePlan(inventory,{phase:'cities',planetEntries:[{uid:'8:1',status:'observed',data:{cities:{city:[ref('7:1')]}}}],runId:'test',analysisPublicKey:'key'});
 const b=await collectResourceBatch(async()=>({status:401,source:{id:'denied'}}),plan,'resource-000',async()=>{});assert.equal(b.entries[0].status,'unavailable');
 const publicPlan=makeResourcePlan(inventory,{phase:'planets',runId:'test',analysisPublicKey:'key'});let calls=0;await assert.rejects(collectResourceBatch(async()=>{calls++;return{status:401};},publicPlan,'resource-000',async()=>{}));assert.equal(calls,1);
});
test('transport failures are explicit observations and cannot become empty cities',async()=>{
 const plan=makeResourcePlan(fixture(),{phase:'planets',runId:'test',analysisPublicKey:'key'});const b=await collectResourceBatch(async()=>{throw Object.assign(Error('timeout'),{name:'TimeoutError'});},plan,'resource-000',async()=>{});assert.equal(b.entries[0].status,'transport_error');
});
