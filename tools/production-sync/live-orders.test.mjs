import test from 'node:test';
import assert from 'node:assert/strict';
import {liveProductionOrders} from './live-orders.mjs';
const manifest={destinations:[{id:'hub',kind:'hub',system:'Eberon',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1']}]};
const stations=[{uid:'s1',system:'Eberon',sysX:'4',sysY:'9',type_name:'Shipyard III'}];
test('live spreadsheet ship change does not require JSON registry edit',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','Endurance-Class Fleet Carrier','1','']]};
 assert.equal(liveProductionOrders({manifest,stations,rowsBySystem})[0].ship,'Endurance-Class Fleet Carrier');
});
test('rejects wrong live coordinates instead of guessing station',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['5,9','TIE/in Interceptor','1','']]};
 assert.throws(()=>liveProductionOrders({manifest,stations,rowsBySystem}),/Unknown station coordinate/);
});
test('rejects missing station rows rather than silently excluding production',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],[]]};
 assert.throws(()=>liveProductionOrders({manifest,stations,rowsBySystem}),/coverage incomplete/);
});

test('vacant hub coordinate is allowed only when unassigned',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','1',''],['5,9','None','0','']]};
 assert.equal(liveProductionOrders({manifest,stations,rowsBySystem}).length,1);
 rowsBySystem.Eberon[3][1]='TIE/in Interceptor';
 assert.throws(()=>liveProductionOrders({manifest,stations,rowsBySystem}),/Unknown station coordinate/);
});

test('depot can be missing from production rows while its shipyard neighbors remain',()=>{
 const m={destinations:[{id:'depot-hub',kind:'hub',system:'Eberon',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1','depot']}]};
 const st=[...stations,{uid:'depot',system:'Eberon',sysX:'5',sysY:'10',type_name:'Depot Station I'}];
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','1','']]};
 assert.equal(liveProductionOrders({manifest:m,stations:st,rowsBySystem}).length,1);
});
