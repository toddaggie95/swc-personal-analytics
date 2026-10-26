import test from 'node:test';
import assert from 'node:assert/strict';
import {mapProductionOrders} from './readiness-orders.mjs';
import {auditOrderCoverage} from './order-coverage.mjs';
const manifest={destinations:[{id:'Tholatin-oneoffs',kind:'oneoff-group',system:'Tholatin',memberStationUids:['5:3579','5:3114'],oneoffs:[{row:109,coordinate:'8,10',stationUid:'5:3579',ship:'Toscan'},{row:110,coordinate:'8,11',stationUid:'5:3114',ship:'Toscan'}]}]};
const stations=[{uid:'5:3579',system:'Tholatin',sysX:'8',sysY:'10'},{uid:'5:3114',system:'Tholatin',sysX:'8',sysY:'11'}];
const rows=Array.from({length:112},()=>[]);
rows[110]=['8,10','TIE/in Interceptor','48','','5:3579'];
rows[111]=['8,11','TIE/in Interceptor','48','Yes','5:3114'];
test('live one-off assignments override stale audited ship labels, while keeping separate pools',()=>{
 const args={auditedOrders:[],manifest,stations,rowsBySystem:{Tholatin:rows},shipBills:new Map([['TIE/in Interceptor',{meleenium:10}]])};
 const orders=mapProductionOrders(args);
 assert.equal(orders.length,2);
 assert.equal(orders[0].destinationId,'Tholatin-oneoffs:5:3579');
 assert.equal(orders[0].bill.meleenium,480);
 assert.equal(orders[1].started,true);
 assert.equal(auditOrderCoverage(args).status,'complete');
});
test('one-off station UID drift fails closed',()=>{
 const bad=rows.map(x=>[...x]);bad[110][4]='wrong';
 assert.throws(()=>mapProductionOrders({auditedOrders:[],manifest,stations,rowsBySystem:{Tholatin:bad},shipBills:new Map([['TIE/in Interceptor',{meleenium:10}]])}),/UID drift/);
});
