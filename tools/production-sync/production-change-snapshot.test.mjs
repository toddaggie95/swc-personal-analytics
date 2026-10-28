import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFromOverview} from './production-change-snapshot.mjs';
import {compareProductionSnapshots} from './production-change-report.mjs';
const order=(status,more={})=>({id:'5:123',system:'Kashyyyk',ownerFaction:'TJO',ship:'TIE/Alpha',quantity:1,started:status==='building',status,...more});
const result=(orders)=>({mode:'read_only',statistics:{liveOrders:orders.length},orders});
test('adapts validated readiness results into stable UID snapshots',()=>{
 const a=snapshotFromOverview(result([order('blocked')]),{batchId:'batch-a'});
 const b=snapshotFromOverview(result([order('building')]),{batchId:'batch-b'});
 const changes=compareProductionSnapshots(a,b);
 assert.equal(changes.currentBatch,'batch-b');
 assert.deepEqual(changes.changes.map(c=>c.type),['production_activity_changed','status_changed','readiness_changed']);
});
test('rejects unverified or inconsistent overview',()=>{
 assert.throws(()=>snapshotFromOverview({mode:'read_only',statistics:{liveOrders:2},orders:[order('blocked')]}),/count mismatch/);
 assert.throws(()=>snapshotFromOverview(result([order('blocked'),order('blocked')])),/duplicate/);
 assert.throws(()=>snapshotFromOverview(result([order('unexpected')])),/readiness/);
});
