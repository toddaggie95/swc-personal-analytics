import test from 'node:test';
import assert from 'node:assert/strict';
import {mapProductionOrders} from './readiness-orders.mjs';
const destination={id:'E-hub',kind:'hub',system:'Eberon',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1']};
const station={uid:'s1',system:'Eberon',sysX:'4',sysY:'9'};
const auditedOrders=[{destinationId:'E-hub',system:'Eberon',x:4,y:9,ship:'TIE/in Interceptor',row:2}];
const shipBills=new Map([['TIE/in Interceptor',{meleenium:10,quantum:2}]]);
const args=quantity=>({manifest:{destinations:[destination]},stations:[station],auditedOrders,rowsBySystem:{Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor',quantity,'','']]},shipBills});
test('production quantity scales all BOM materials without mutating live rows',()=>{
 const input=args('3'),before=JSON.stringify(input.rowsBySystem);
 const orders=mapProductionOrders(input);
 assert.equal(orders[0].quantity,3);
 assert.deepEqual(orders[0].bill,{meleenium:30,quantum:6});
 assert.equal(JSON.stringify(input.rowsBySystem),before);
});
test('invalid production quantities fail closed',()=>{
 for(const quantity of ['','0','-1','1.5','abc']){
  assert.throws(()=>mapProductionOrders(args(quantity)),/Invalid order quantity/,String(quantity));
 }
});
test('stations in other systems do not introduce coordinate ambiguity',()=>{
 const input=args('2');
 input.stations.push({uid:'k1',system:'Kashyyyk',sysX:'4',sysY:'9'});
 assert.equal(mapProductionOrders(input)[0].id,'s1');
});
test('started production does not reserve another material bill',()=>{
 const input=args('3');
 input.rowsBySystem.Eberon[2][3]='Yes';
 input.shipBills=new Map();
 const order=mapProductionOrders(input)[0];
 assert.equal(order.started,true);
 assert.deepEqual(order.bill,{});
});
