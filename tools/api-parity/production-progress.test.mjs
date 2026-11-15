import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planIdentity,newProgress,validateProgress,MAX_AGE_MS} from './production-progress.mjs';
const now=Date.now(),stations=[{uid:'5:1',ownerUid:'20:1',typeName:'Shipyard I',location:{system:{uid:'9:1',name:'Test'}}}];
const identity=planIdentity(stations,'contract');
const entry={uid:'5:1',ownerUid:'20:1',operations:{productionStateValidated:true,productionStatus:'',productionQuantity:'',tooledTo:'',observedAt:new Date(now).toISOString()}};
test('compatible partial progress restores exact validated UID without new detail reads',()=>{
 const p={...newProgress(identity,now),entries:[entry]};assert.equal(validateProgress(p,identity,stations,now).size,1);
 assert.equal(validateProgress(newProgress(identity,now),identity,stations,now).size,0);
});
test('changed plan, contract, owner, duplicates and stale progress fail closed',()=>{
 const p={...newProgress(identity,now),entries:[entry]};
 assert.notEqual(planIdentity(stations,'new-contract'),identity);
 assert.throws(()=>validateProgress(p,'changed-plan',stations,now));
 assert.throws(()=>validateProgress(p,identity,stations,now+MAX_AGE_MS+1));
 assert.throws(()=>validateProgress({...p,entries:[entry,entry]},identity,stations,now));
 assert.throws(()=>validateProgress(p,identity,[{...stations[0],ownerUid:'20:2'}],now));
 assert.throws(()=>validateProgress({...p,entries:[{...entry,operations:{...entry.operations,observedAt:'bad'}}]},identity,stations,now));
 assert.throws(()=>validateProgress({...p,entries:[{...entry,operations:{...entry.operations,productionStatus:'running',productionQuantity:'0'}}]},identity,stations,now));
});
