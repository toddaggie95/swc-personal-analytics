import test from 'node:test';
import assert from 'node:assert/strict';
import {mapProductionOrders} from './readiness-orders.mjs';
const manifest={destinations:[{id:'Eberon-hub-1-0',kind:'hub',title:'Hub (5,10)',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1']}]};
const stations=[{uid:'s1',system:'Eberon',sysX:'4',sysY:'9'}];
const auditedOrders=[{destinationId:'Eberon-hub-1-0',system:'Eberon',x:4,y:9,ship:'TIE/in Interceptor',row:2}];
const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','48','', '']]};
const shipBills=new Map([['TIE/in Interceptor',{meleenium:10,quantum:2}]]);
const inputs=()=>({manifest,stations,auditedOrders,rowsBySystem,shipBills});
test('reads quantity and multiplies material bill without mutating sheet',()=>{
 const r=mapProductionOrders(inputs());assert.equal(r.length,1);assert.equal(r[0].bill.meleenium,480);assert.equal(r[0].started,false);assert.equal(r[0].id,'s1');
});
test('fails closed on changed ship design',()=>{
 const args=inputs();args.rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','Other','48','']]};
 assert.throws(()=>mapProductionOrders(args),/drift/);
});
test('fails closed on ambiguous station coordinates',()=>{
 const args=inputs();args.stations=[...stations,{uid:'s2',system:'Eberon',sysX:'4',sysY:'9'}];
 args.manifest={destinations:[{...manifest.destinations[0],memberStationUids:['s1','s2']}]};
 assert.throws(()=>mapProductionOrders(args),/Ambiguous/);
});
test('fails closed on missing ship bill',()=>{
 const args=inputs();args.shipBills=new Map();assert.throws(()=>mapProductionOrders(args),/Unverified/);
});
