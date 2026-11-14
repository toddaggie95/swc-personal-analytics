import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionState,canonicalRow} from './production-contract.mjs';
const action=(type,value={})=>({attributes:{type},value});
test('idle assignment never implies running production',()=>{
 assert.equal(productionState({}).productionStatus,'');
 const s=productionState({tooledto:{value:'Ship'}});
 assert.equal(s.productionStatus,'');assert.equal(s.tooledTo,'Ship');
});
test('running state requires explicit action, queue, quantity and tooling',()=>{
 const detail={actions:{action:[action('EntityProductionAction',{status:'running',quantity:'48'})]},queueitems:{queueitem:[{status:'producing'}]},tooledto:{value:'Ship'}};
 assert.equal(productionState(detail).productionQuantity,'48');
 assert.equal(productionState(detail).productionStatus,'running');
 assert.throws(()=>productionState({...detail,tooledto:null}));
 assert.throws(()=>productionState({...detail,queueitems:{queueitem:[]}}));
 assert.throws(()=>productionState({...detail,actions:{action:[]}}));
});
test('retooling with queued entity action is nonrunning; conflicts fail',()=>{
 const detail={actions:{action:[action('RetoolingAction'),action('EntityProductionAction',{status:'running',quantity:1})]},queueitems:{queueitem:[{status:'queued'}]}};
 assert.equal(productionState(detail).productionStatus,'');
 assert.throws(()=>productionState({...detail,queueitems:{queueitem:[{status:'producing'}]}}));
 assert.throws(()=>productionState({actions:{action:[action('Unexpected')]}}));
});
test('canonical output retains ownership, zero coordinates and production quantity',()=>{
 const row=canonicalRow({uid:'5:1',ownerUid:'20:1174',typeName:'Shipyard I',location:{system:{name:'Test',uid:'9:1'}},coordinates:{system:{x:0,y:1}},operations:{productionStateValidated:true,productionStatus:'running',productionQuantity:'48',tooledTo:'Ship'}});
 assert.equal(row.owner_uid,'20:1174');assert.equal(row.sysX,'0');assert.equal(row.productionQuantity,'48');
 assert.equal(canonicalRow({uid:'5:2',typeName:'Shipyard I'}).productionStatus,null);
 assert.throws(()=>canonicalRow({uid:'5:3',entityType:'stations',typeName:null}),/station type/);
 assert.throws(()=>canonicalRow({uid:'5:4',operations:{productionStateValidated:true,productionStatus:'running',productionQuantity:'0',tooledTo:'Ship'}}),/quantity/);
});
