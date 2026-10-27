import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeReadiness} from './readiness-summary.mjs';
test('five exclusive statuses reconcile across systems',()=>{
 const statuses=['building','ready_now','transfer','blocked','unassigned'];
 const orders=statuses.map((status,i)=>({id:String(i),system:i<3?'Kashyyyk':'Eberon',status}));
 const summary=summarizeReadiness(orders,['Tholatin']);
 assert.equal(summary.totals.total,5);
 assert.deepEqual(statuses.map(k=>summary.totals[k]),[1,1,1,1,1]);
 assert.equal(summary.rows.find(r=>r.system==='Tholatin').total,0);
 assert.equal(summary.rows.find(r=>r.system==='Kashyyyk').total,3);
});
test('rejects duplicate orders and invalid statuses',()=>{
 assert.throws(()=>summarizeReadiness([{id:'a',system:'X',status:'blocked'},{id:'a',system:'X',status:'blocked'}]),/Duplicate/);
 assert.throws(()=>summarizeReadiness([{id:'a',system:'X',status:'unknown'}]),/Invalid/);
});

test('empty system totals remain zero',()=>{const s=summarizeReadiness([],['Eberon']);assert.equal(s.rows[0].total,0);});
