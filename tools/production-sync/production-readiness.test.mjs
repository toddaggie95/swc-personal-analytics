import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateReadiness} from './production-readiness.mjs';
const p=(id,destinationId,materials,system='Eberon')=>({id,destinationId,materials,system});
const o=(id,destinationId,bill,stationPoolId=id,extra={})=>({id,system:'Eberon',destinationId,stationPoolId,ship:'Test ship',bill,...extra});
test('hub materials can start ship without station-level movement',()=>{
 const r=allocateReadiness({pools:[p('yard','hub',{mel:0}),p('depot','hub',{mel:20})],orders:[o('yard','hub',{mel:20})]});
 assert.equal(r.orders[0].status,'ready_now');assert.equal(r.reservations[0].sourcePoolId,'depot');
});
test('system material is allocated once; other system excluded',()=>{
 const r=allocateReadiness({pools:[p('a','hubA',{}),p('b','hubB',{}),p('source','hubC',{mel:20}),p('foreign','other',{mel:999},'Kashyyyk')],orders:[o('a','hubA',{mel:15}),o('b','hubB',{mel:15})]});
 assert.deepEqual(r.orders.map(x=>x.status),['transfer','blocked']);assert.equal(r.reservations.reduce((n,x)=>n+x.quantity,0),15);
});
test('priority first for local starts',()=>{
 const r=allocateReadiness({pools:[p('depot','hub',{mel:20}),p('capital','hub',{}),p('fighter','hub',{})],orders:[o('capital','hub',{mel:20}),o('fighter','hub',{mel:20})],priority:x=>x.id==='capital'?0:1});
 assert.deepEqual(r.orders.map(x=>x.status),['ready_now','blocked']);
});
test('started and unassigned orders consume no materials',()=>{
 const r=allocateReadiness({pools:[p('yard','hub',{mel:10})],orders:[o('yard','hub',{mel:10},'yard',{started:true}),o('none','hub',{},'yard',{ship:'None'})]});
 assert.equal(r.reservations.length,0);assert.deepEqual(r.orders.map(x=>x.status),['unassigned','building']);
});
test('duplicate inventory pools fail closed',()=>assert.throws(()=>allocateReadiness({pools:[p('a','hub',{}),p('a','hub',{})],orders:[]}),/Duplicate/));
test('incomplete material bills fail closed',()=>assert.throws(()=>allocateReadiness({pools:[p('a','hub',{})],orders:[o('a','hub',{})]}),/bill/));
