import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateReadiness} from './production-readiness.mjs';
const pool=(id,destinationId,materials,system='Kashyyyk')=>({id,destinationId,materials,system});
const order=(id,destinationId,bill,system='Kashyyyk')=>({id,stationPoolId:id,system,destinationId,ship:'Test ship',bill});
test('allocations conserve station inventory and leave inputs unchanged',()=>{
 const pools=[pool('yard','hub',{meleenium:10,quantum:10}),pool('depot','hub',{meleenium:20,quantum:10}),pool('other','other',{meleenium:50,quantum:20})];
 const orders=[order('yard','hub',{meleenium:25,quantum:15}),order('other','other',{meleenium:45,quantum:20})];
 const before=JSON.stringify({pools,orders});
 const result=allocateReadiness({pools,orders});
 assert.equal(JSON.stringify({pools,orders}),before);
 for(const original of pools){
  const remaining=result.remainingPools.find(p=>p.id===original.id);
  for(const [material,initial] of Object.entries(original.materials)){
   const used=result.reservations.filter(r=>r.sourcePoolId===original.id&&r.material===material).reduce((n,r)=>n+r.quantity,0);
   assert.equal(used+(remaining.materials[material]??0),initial);
  }
 }
 assert.equal(result.orders.length,2);
});
test('foreign-system inventory cannot satisfy an order',()=>{
 const result=allocateReadiness({pools:[pool('yard','hub',{meleenium:0}),pool('foreign','foreign',{meleenium:100},'Eberon')],orders:[order('yard','hub',{meleenium:20})]});
 assert.equal(result.orders[0].status,'blocked');
 assert.deepEqual(result.orders[0].shortfall,{meleenium:20});
 assert.equal(result.reservations.length,0);
});
test('already-started production does not reserve additional inventory',()=>{
 const result=allocateReadiness({pools:[pool('yard','hub',{meleenium:10}),pool('second','hub',{})],orders:[{...order('yard','hub',{}),started:true},order('second','hub',{meleenium:20})]});
 assert.equal(result.orders.find(x=>x.id==='yard').status,'building');
 assert.equal(result.orders.find(x=>x.id==='second').status,'blocked');
 assert.equal(result.reservations.length,0);
});
