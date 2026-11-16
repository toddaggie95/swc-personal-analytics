import test from 'node:test';import assert from 'node:assert/strict';
import{inventoryPage,fullInventory,fullTypeIndex,makeCapturePlan,collectBatch,hash,verifyPlan}from'./planet-capture.mjs';
import{assembleSnapshot,compareSnapshots,verifySnapshot,appendReconciliationEvidence}from'./planet-snapshot.mjs';
const ref=uid=>({attributes:{uid},value:uid});
const source=(id)=>({id,observedAt:new Date().toISOString(),sha256:'a'.repeat(64)});
const wrap=data=>({swcapi:{result:data}});
const facility=(id,owner='20:1',type='4:1')=>({uid:id,owner:ref(owner),type:ref(type),location:{planet:ref('8:1'),city:ref('7:1'),coordinates:{ground:{attributes:{x:1,y:1}}}},orientation:'v',underconstruction:'no',wrecked:'no'});
const page=(rows,total,start=1)=>({entities:{attributes:{total,start,count:rows.length},entity:rows}});
function fixture(){
 const a=facility('4:100'),b=facility('4:200','20:2','4:2'),c={...facility('4:300','20:3','4:3'),underconstruction:'yes'};
 const s=source('inventory-1');
 const inventory={createdAt:new Date().toISOString(),planet:{uid:'8:1',name:'Synthetic',size:2,cities:{city:[ref('7:1')]}},sources:[s],
  inventories:[{ownerUid:'20:1',kind:'facilities',status:'complete',total:1,rows:[a],sources:[s]},
   {ownerUid:'20:2',kind:'facilities',status:'complete',total:1,rows:[b],sources:[s]},
   {ownerUid:'20:1',kind:'cities',status:'complete',total:1,rows:[{uid:'7:1'}],sources:[s]}],
  typeIndex:{types:[{uid:'4:1'},{uid:'4:2'},{uid:'4:3'}]}};
 const plan=makeCapturePlan(inventory,{runId:'synthetic',analysisPublicKey:'test'});
 const buildings=[a,b,c].map(row=>({...row,attributes:{x:1,y:1}}));
 const data={cities:[{uid:'7:1',status:'observed',source:source('city-1'),data:{uid:'7:1',location:{planet:ref('8:1')},owner:ref('20:1'),layout:'opaque',buildings:{building:buildings}}}],
  types:[{uid:'4:1',jobs:10,flats:5,sizex:1,sizey:3},{uid:'4:2',jobs:40,flats:0,sizex:5,sizey:5},{uid:'4:3',jobs:5,flats:50,sizex:5,sizey:5}].map((data,i)=>({uid:data.uid,status:'observed',data,source:source('type-'+i)}))};
 const batches=plan.batches.map(batch=>({schemaVersion:1,runId:plan.runId,planIdentity:plan.identity,id:batch.id,kind:batch.kind,complete:true,entries:data[batch.kind]}));
 return {inventory,plan,batches};
}
test('pagination advances by actual returned count, validates exact coverage and zero omission',async()=>{
 const starts=[];const result=await fullInventory(async(_e,q)=>{starts.push(q.start_index);return {status:200,source:source('p'+starts.length),body:wrap(page([facility('4:'+q.start_index)],2,q.start_index))};},
  {ownerUid:'20:1',planetUid:'8:1',kind:'facilities'});
 assert.deepEqual(starts,[1,2]);assert.equal(result.rows.length,2);
 assert.equal(inventoryPage({entities:{attributes:{start:1,total:0}}},{start:1,planetUid:'8:1',ownerUid:'20:1',prefix:'4'}).count,0);
});
test('changing totals, duplicate pages and wrong ownership cannot certify coverage',async()=>{
 for(const mode of ['total','duplicate','owner']){let call=0;
  await assert.rejects(fullInventory(async(_e,q)=>{call++;return {status:200,source:source('p'+call),body:wrap(page([facility(mode==='duplicate'?'4:1':'4:'+call,mode==='owner'?'20:9':'20:1')],mode==='total'&&call===2?3:2,q.start_index))};},
   {ownerUid:'20:1',planetUid:'8:1',kind:'facilities'}));
 }
});
test('type catalog pagination respects server cap rather than requested page size',async()=>{
 const starts=[];const r=await fullTypeIndex(async(_e,q)=>{starts.push(q.start_index);return {status:200,source:source('t'+starts.length),body:wrap({attributes:{start:q.start_index,total:2,count:1},facilitytype:[ref('4:'+q.start_index)]})};});
 assert.deepEqual(starts,[1,2]);assert.equal(r.types.length,2);
});
test('plan identity is bound to inventory and bounded unique targets',()=>{
 const {plan}=fixture();assert.equal(verifyPlan(plan),plan);const changed=structuredClone(plan);changed.planetUid='8:2';assert.throws(()=>verifyPlan(changed));
});
test('batch preserves unavailable foreign city evidence but denies owned city failures',async()=>{
 const {inventory}=fixture();inventory.planet.cities.city.push(ref('7:2'));
 const plan=makeCapturePlan(inventory,{runId:'test',analysisPublicKey:'test'});let saved;
 await assert.rejects(collectBatch(async()=>({status:401,source:source('bad')}),plan,'cities-000',r=>{saved=r;}));
 assert.equal(saved.complete,false);
});
test('UID deduplication conserves completed jobs/flats across city and owner sources',()=>{
 const f=fixture();const s=assembleSnapshot(f.inventory,f.plan,f.batches);
 assert.equal(s.coverage.uniqueFacilities,3);assert.equal(s.totals.includedCompleted.facilities,2);
 assert.equal(s.totals.includedCompleted.jobs,50);assert.equal(s.totals.includedCompleted.flats,5);assert.equal(s.totals.includedCompleted.area,28);
 assert.equal(s.totals.excludedUnderConstruction,1);assert.equal(s.facilities[0].observations.length,2);
 assert.equal(s.byOwner.reduce((sum,o)=>sum+o.total.jobs,0),50);assert.equal(s.reconciliation.status,'pending_independent_controls');
 assert.equal(verifySnapshot(s),s);
});
test('conflicting owner or coordinates across observations fail instead of selecting a convenient value',()=>{
 for(const field of ['owner','attributes']){const f=fixture();const row=f.batches.find(b=>b.kind==='cities').entries[0].data.buildings.building[0];
  row[field]=field==='owner'?ref('20:99'):{x:9,y:1};assert.throws(()=>assembleSnapshot(f.inventory,f.plan,f.batches),/conflicting/);
 }
});
test('missing worker output, extra output and foreign inventory do not form a snapshot',()=>{
 const f=fixture();assert.throws(()=>assembleSnapshot(f.inventory,f.plan,f.batches.slice(1)));
 assert.throws(()=>assembleSnapshot(f.inventory,f.plan,[...f.batches,f.batches[0]]));
 const changed=structuredClone(f.inventory);changed.planet.uid='8:9';assert.throws(()=>assembleSnapshot(changed,f.plan,f.batches));
});
test('unknown construction status and absent city building collection stay unresolved',()=>{
 const f=fixture();const city=f.batches.find(b=>b.kind==='cities').entries[0].data;
 delete f.inventory.inventories[0].rows[0].underconstruction;delete city.buildings.building[0].underconstruction;
 const plan=makeCapturePlan(f.inventory,{runId:'test',analysisPublicKey:'test'});for(const b of f.batches){b.planIdentity=plan.identity;b.runId=plan.runId;}
 const s=assembleSnapshot(f.inventory,plan,f.batches);assert.equal(s.totals.unresolvedFacilities,1);assert.equal(s.reconciliation.status,'incomplete_coverage');
});
test('absent city building arrays do not certify an empty city',()=>{
 const f=fixture();delete f.batches.find(b=>b.kind==='cities').entries[0].data.buildings;
 const s=assembleSnapshot(f.inventory,f.plan,f.batches);assert.equal(s.coverage.observedCities,0);assert.deepEqual(s.coverage.missingCities,['7:1']);
});
test('missing catalog economics stay unknown rather than becoming zero',()=>{
 const f=fixture();delete f.batches.find(b=>b.kind==='types').entries[0].data.jobs;
 const s=assembleSnapshot(f.inventory,f.plan,f.batches);assert.equal(s.totals.unresolvedFacilities,1);
 assert.equal(s.facilities.find(f=>f.uid==='4:100').contribution.reason,'missing_type_economics');
 assert.equal(s.catalog.find(t=>t.uid==='4:1').jobs,null);
});
test('basic city building references remain identifiable unresolved observations',()=>{
 const f=fixture();const city=f.batches.find(b=>b.kind==='cities').entries[0].data;
 city.buildings.building.push({uid:'4:400',name:'Basic only',images:{small:'https://example.test/image.gif'},attributes:{x:3,y:4}});
 const s=assembleSnapshot(f.inventory,f.plan,f.batches),basic=s.facilities.find(f=>f.uid==='4:400');
 assert.equal(s.coverage.uniqueFacilities,4);assert.equal(s.totals.unresolvedFacilities,1);
 assert.equal(basic.typeUid,null);assert.equal(basic.ownerUid,null);assert.equal(basic.x,3);assert.equal(basic.name,'Basic only');
 assert.equal(basic.contribution.reason,'missing_type');assert.equal(s.reconciliation.status,'incomplete_coverage');
});
test('transfers are distinguished from construction or disappearance and hashes detect tampering',()=>{
 const f=fixture();const before=assembleSnapshot(f.inventory,f.plan,f.batches),after=structuredClone(before);
 after.snapshotId='later';after.facilities[0].ownerUid='20:9';delete after.contentSha256;after.contentSha256=hash(after);
 const diff=compareSnapshots(before,after);assert.equal(diff.transferred.length,1);assert.deepEqual(diff.added,[]);assert.deepEqual(diff.noLongerObserved,[]);
 after.facilities[0].ownerUid='20:10';assert.throws(()=>verifySnapshot(after));
});
test('reconciliation revisions retain immutable parent evidence and cannot silently certify historical controls',()=>{
 const f=fixture(),original=assembleSnapshot(f.inventory,f.plan,f.batches),originalText=JSON.stringify(original);
 const revision=appendReconciliationEvidence(original,{controls:[{source:'historical sheet',currency:'historical',jobs:50}],
  ownerClassifications:{'20:1':{group:'TFF',evidence:'confirmed identity'}}},'synthetic-r2');
 assert.equal(JSON.stringify(original),originalText);assert.equal(revision.parentSnapshotSha256,original.contentSha256);
 assert.equal(revision.optimizationReady,false);assert.equal(revision.reconciliation.status,'pending_independent_controls');
 assert.equal(revision.byOwner.find(o=>o.uid==='20:1').classification.group,'TFF');assert.equal(verifySnapshot(revision),revision);
 assert.equal(compareSnapshots(original,revision).transferred.length,0);
});
