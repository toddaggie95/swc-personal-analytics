import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReadiness} from './compare-readiness.mjs';
const order={id:'5:100',system:'Kashyyyk',destinationId:'hub',ship:'TIE',quantity:1,started:false,status:'ready_now',bill:{meleenium:100,quantum:5}};
const make=o=>({mode:'read_only',orders:o,statistics:{liveOrders:o.length}});
test('identical readiness and prior snapshot produce matching changes',()=>{
 const previous={batchId:'prior',stations:[{uid:'5:100',system:'Kashyyyk',ship:'TIE',quantity:1,started:false,status:'idle',readiness:'blocked'}]};
 const result=compareReadiness(make([order]),make([{...order,bill:{quantum:5,meleenium:100}}]),previous);
 assert.equal(result.status,'matched');
 assert.equal(result.changes.matched,true);
});
test('nested bill difference is not ignored',()=>{
 const changed={...order,bill:{...order.bill,quantum:6}};
 const result=compareReadiness(make([order]),make([changed]));
 assert.equal(result.status,'differences');
 assert.ok(result.differences.some(x=>x.field==='bill'));
});
test('missing station and duplicate station fail validation',()=>{
 assert.equal(compareReadiness(make([order]),make([])).status,'differences');
 assert.throws(()=>compareReadiness(make([order,order]),make([])),/duplicate/);
});
test('unknown or writable output rejected',()=>{
 assert.throws(()=>compareReadiness({mode:'write',orders:[order]},make([order])),/Read-only/);
});
