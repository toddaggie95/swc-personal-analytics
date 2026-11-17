import test from'node:test';import assert from'node:assert/strict';import{planFleetPages,collectFleetPages,assembleFleetPages}from'./fleet-pages.mjs';
const ref=uid=>({attributes:{uid}}),row=(id,kind='facilities')=>({uid:(kind==='facilities'?'4:':'7:')+id,owner:ref('20:1'),location:{planet:ref('8:1')}});
const response=(rows,total,start)=>({status:200,source:{id:'source'+start},body:{swcapi:{entities:{attributes:{total,start,count:rows.length},entity:rows}}}});
test('bounded parallel pages conserve exact total and owner coverage',async()=>{
 const{plan,inventories}=await planFleetPages(async(e)=>e.includes('facilities')?response([row(1)],3,1):response([],0,1),[{uid:'20:1'}],{runId:'test',analysisPublicKey:'key'});
 assert.deepEqual(plan.batches[0].targets.map(t=>t.start),[2,3]);
 const result=await collectFleetPages(async(_e,q)=>response([row(q.start_index)],3,q.start_index),plan,'pages-000',async()=>{});
 const assembled=assembleFleetPages(plan,inventories,[result]);assert.equal(assembled.index.planets[0].facilityCount,3);assert.equal(assembled.inventory.inventories[0].status,'complete');
 assert.throws(()=>assembleFleetPages(plan,inventories,[]));
});
test('total drift stops a worker and preserves partial results instead of mixing epochs',async()=>{
 const{plan}=await planFleetPages(async(e)=>e.includes('facilities')?response([row(1)],3,1):response([],0,1),[{uid:'20:1'}],{runId:'test',analysisPublicKey:'key'});
 let saved;await assert.rejects(collectFleetPages(async()=>response([row(2)],4,2),plan,'pages-000',async r=>{saved=r;}));assert.equal(saved.complete,false);
});
