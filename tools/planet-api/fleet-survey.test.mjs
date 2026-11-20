import test from'node:test';import assert from'node:assert/strict';import{surveyOwner,indexFleet,recoverSurveyState}from'./fleet-survey.mjs';
const ref=uid=>({attributes:{uid},value:uid});const row=(id,planet='8:1')=>({uid:id,owner:ref('20:1'),location:{planet:planet?ref(planet):null}});
const response=(rows,total,start=1)=>({status:200,source:{id:'p'+start},body:{swcapi:{entities:{attributes:{start,total,count:rows.length},entity:rows}}}});
test('global owner survey advances by actual count without guessing planets',async()=>{
 const calls=[];const d=await surveyOwner(async(_e,q)=>{calls.push(q);return response([row('4:'+q.start_index,q.start_index===1?'8:1':null)],2,q.start_index);},{ownerUid:'20:1',kind:'facilities'});
 assert.deepEqual(calls.map(q=>q.start_index),[1,2]);assert.ok(calls.every(q=>!Object.keys(q).some(k=>k.startsWith('filter'))));
 const index=indexFleet([d]);assert.equal(index.planets[0].facilityCount,1);assert.equal(index.unlocated.length,1);assert.equal(index.allPhysicalPlanetsVerified,false);
});
test('continuation resumes after the last retained row and skips complete or denied inventories',async()=>{
 const resume={ownerUid:'20:1',kind:'facilities',status:'partial',rows:[row('4:1')],sources:[{id:'old'}],total:2};const starts=[];
 const result=await surveyOwner(async(_e,q)=>{starts.push(q.start_index);return response([row('4:2')],2,q.start_index);},{ownerUid:'20:1',kind:'facilities',resume});
 assert.deepEqual(starts,[2]);assert.equal(result.rows.length,2);assert.equal(result.sources.length,2);
 await surveyOwner(async()=>{throw Error('must not repeat');},{ownerUid:'20:1',kind:'facilities',resume:result});
 const recovered=recoverSurveyState({schemaVersion:1,factions:[{uid:'20:1'}],inventories:[]},[resume]);assert.equal(recovered.inventories[0].rows.length,1);
 await assert.rejects(surveyOwner(async()=>response([row('4:2')],3,2),{ownerUid:'20:1',kind:'facilities',resume}));
});
test('drifting totals and duplicate or foreign-owner rows cannot imply complete inventory',async()=>{
 for(const mode of['total','duplicate','owner']){let n=0;await assert.rejects(surveyOwner(async()=>{n++;const r=row('4:'+(mode==='duplicate'?1:n));if(mode==='owner')r.owner=ref('20:9');return response([r],mode==='total'&&n===2?3:2,n);},{ownerUid:'20:1',kind:'facilities'}));}
});
test('permission gaps and partial checkpoints are preserved without unchanged-credential retries',async()=>{
 let calls=0;const checkpoint=[];await assert.rejects(surveyOwner(async()=>{calls++;return{status:401,source:{id:'denied'}};},{ownerUid:'20:1',kind:'facilities'},async d=>checkpoint.push(d)));
 assert.equal(calls,1);assert.equal(checkpoint.at(-1).status,'partial');
 const d=await surveyOwner(async()=>({status:403,source:{id:'forbidden'}}),{ownerUid:'20:1',kind:'facilities'});assert.equal(d.status,'unavailable');assert.equal(indexFleet([d]).allAccessibleOwnerInventoriesComplete,false);
});
test('zero inventories, duplicate cross-owner identities and non-planet space locations are explicit',async()=>{
 const d=await surveyOwner(async()=>response([],0),{ownerUid:'20:1',kind:'cities'});assert.equal(d.status,'complete');
 const f={ownerUid:'20:1',kind:'facilities',status:'complete',total:1,rows:[row('4:1')]};assert.throws(()=>indexFleet([f,f]));
});
