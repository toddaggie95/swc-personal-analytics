import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,validatePlan,selectBatch,mergeResults} from './production-batches.mjs';
import {MAX_AGE_MS} from './production-progress.mjs';
const now=Date.now(),contract=Buffer.from('production contract');
const clone=value=>structuredClone(value);
function documents(count=1013){
 const stations=Array.from({length:count},(_,i)=>({uid:'5:'+(i+1),ownerUid:'20:1',entityType:'stations',typeName:'Shipyard I',location:{system:{uid:'9:1',name:'Test'}}}));
 return [{name:'tff-stations.json',faction:'tff',doc:{stations,summary:{ownerUid:'20:1'}}},{name:'tjo-stations.json',faction:'tjo',doc:{stations:[],summary:{ownerUid:'20:2'}}}];
}
function result(plan,batch=plan.batches[0],count=batch.stations.length){return {id:batch.id,identity:plan.identity,entries:batch.stations.slice(0,count).map(s=>({uid:s.uid,ownerUid:s.ownerUid,operations:{productionStateValidated:true,productionStatus:'',productionQuantity:'',tooledTo:'',observedAt:new Date(now).toISOString()}}))};}
test('1013 targets produce 21 bounded batches and exact detail coverage',()=>{
 const plan=makePlan(documents(),['Test'],contract,null,now);
 assert.equal(plan.batches.length,21);assert.equal(plan.batches.at(-1).stations.length,13);
 assert.equal(validatePlan(plan,contract,now).length,1013);
 const merged=mergeResults(plan,plan.batches.map(b=>result(plan,b)),contract,now);
 assert.equal(merged.complete,true);assert.deepEqual(merged.missing,[]);
 assert.equal(merged.documents[0].doc.summary.productionDetails,1013);assert.equal(merged.documents[1].doc.summary.productionDetails,0);
});
test('filter includes only tracked shipyards and rejects duplicate inventory identities',()=>{
 const docs=documents(3);docs[0].doc.stations[1].typeName='Depot Station I';docs[0].doc.stations[2].location.system.name='Elsewhere';
 const plan=makePlan(docs,['Test'],contract,null,now);assert.equal(validatePlan(plan,contract,now).length,1);
 docs[0].doc.stations.push(clone(docs[0].doc.stations[0]));assert.throws(()=>makePlan(docs,['Test'],contract,null,now));
});
test('partial and missing results retain successes and resume skips them',()=>{
 const plan=makePlan(documents(75),['Test'],contract,null,now),partial=mergeResults(plan,[result(plan,plan.batches[0],10)],contract,now);
 assert.equal(partial.complete,false);assert.equal(partial.progress.entries.length,10);assert.equal(partial.missing.length,65);
 assert.equal(Object.hasOwn(partial.documents[0].doc.summary,'productionDetails'),false);
 const resumed=makePlan(documents(75),['Test'],contract,partial.progress,now+1000);
 assert.equal(resumed.batches.flatMap(b=>b.stations).length,65);
 const oldUids=new Set(partial.progress.entries.map(e=>e.uid));assert.equal(resumed.batches.flatMap(b=>b.stations).some(s=>oldUids.has(s.uid)),false);
 assert.equal(mergeResults(plan,[],contract,now).missing.length,75);
});
test('completed and empty target plans use the complete placeholder',()=>{
 const plan=makePlan(documents(1),['Test'],contract,null,now),done=mergeResults(plan,[result(plan)],contract,now);
 const resumed=makePlan(documents(1),['Test'],contract,done.progress,now);
 assert.deepEqual(resumed.batches,[{id:'complete',stations:[]}]);assert.equal(mergeResults(resumed,[],contract,now).complete,true);
 const empty=makePlan(documents(0),['Test'],contract,null,now);assert.equal(mergeResults(empty,[],contract,now).complete,true);
});
test('plan identity, contract, time, batch limits and exact pending coverage fail closed',()=>{
 const plan=makePlan(documents(75),['Test'],contract,null,now);
 for(const mutate of [p=>p.identity='wrong',p=>p.batches.pop(),p=>p.batches.push(clone(p.batches[0])),p=>p.batches[0].stations.push(p.batches[1].stations[0]),p=>p.batches[0].stations[0].ownerUid='20:9',p=>p.batches[0].stations[0].uid='5:9999',p=>p.plannedAt=new Date(now+1).toISOString(),p=>p.createdAt='bad']){
  const changed=clone(plan);mutate(changed);assert.throws(()=>validatePlan(changed,contract,now));
 }
 assert.throws(()=>validatePlan(plan,'changed contract',now));assert.throws(()=>validatePlan(plan,contract,now+MAX_AGE_MS+1));
 assert.throws(()=>selectBatch(plan,'unknown',contract,now));
});
test('results reject unknown or duplicate batches, duplicated/unexpected UIDs and wrong owners',()=>{
 const plan=makePlan(documents(75),['Test'],contract,null,now),valid=result(plan);
 assert.throws(()=>mergeResults(plan,[valid,valid],contract,now));
 for(const mutate of [r=>r.id='999',r=>r.identity='wrong',r=>r.entries.push(clone(r.entries[0])),r=>r.entries[0].uid=plan.batches[1].stations[0].uid,r=>r.entries[0].ownerUid='20:9',r=>r.entries[0].operations.productionStateValidated=false,r=>r.entries[0].operations.observedAt=new Date(now+1).toISOString(),r=>r.entries[0].operations.productionStatus='invalid']){
  const changed=clone(valid);mutate(changed);assert.throws(()=>mergeResults(plan,[changed],contract,now));
 }
});
test('inputs and returned selections never mutate one another',()=>{
 const docs=documents(4),before=clone(docs),plan=makePlan(docs,['Test'],contract,null,now),planBefore=clone(plan),results=[result(plan)],resultsBefore=clone(results);
 const merged=mergeResults(plan,results,contract,now);const selected=selectBatch(plan,'000',contract,now);selected.stations[0].uid='changed';merged.documents[0].doc.stations[0].name='changed';
 assert.deepEqual(docs,before);assert.deepEqual(plan,planBefore);assert.deepEqual(results,resultsBefore);
});
test('all four normalized documents retain material lots without station detail annotations',()=>{
 const docs=documents(2);
 for(const faction of ['tff','tjo'])docs.push({name:faction+'__materials__all__capture.json',faction,doc:{summary:{entityType:'materials'},materials:[{uid:'13:'+faction,quantity:42}]}});
 const plan=makePlan(docs,['Test'],contract,null,now),merged=mergeResults(plan,[result(plan)],contract,now);
 assert.equal(merged.complete,true);assert.deepEqual(merged.documents.slice(2),docs.slice(2));assert.equal(plan.batches.flatMap(b=>b.stations).length,2);
});
