import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCapturedReadiness} from './run-readiness-parity.mjs';

test('fail closed on incomplete workbook capture',()=>{
  assert.throws(()=>compareCapturedReadiness({},[],[],[],[]),/Snapshot requires/);
  assert.throws(()=>compareCapturedReadiness({manifest:{destinations:[]},rowsBySystem:{Kashyyyk:[]},shipRows:[]},[],[],[],[]),/No Kashyyyk destinations/);
});

test('require Kashyyyk workbook rows even if other system rows are present',()=>{
 assert.throws(()=>compareCapturedReadiness({manifest:{destinations:[{system:'Kashyyyk'}]},rowsBySystem:{Eberon:[]},shipRows:[[]]},[],[],[],[]),/Snapshot requires/);
});

test('same workbook and identical source inventories yield per-order parity',()=>{
 const manifest={destinations:[{id:'Kashyyyk-hub-1-0',kind:'hub',title:'Hub (5,10)',center:{x:5,y:10},target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:12},system:'Kashyyyk',memberStationUids:['s1','s2']}]};
 const stations=[{uid:'s1',system:'Kashyyyk',sysX:'4',sysY:'9',type_name:'Shipyard'},{uid:'s2',system:'Kashyyyk',sysX:'5',sysY:'10',type_name:'Shipyard'}];
 const materials=[{uid:'p1',type_name:'Meleenium',quantity:'480',container_type_name:'Stations',container_uid:'s2',system:'Kashyyyk'}];
 const snapshot={manifest,rowsBySystem:{Kashyyyk:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','48',''],['5,10','','','']]},shipRows:[['Ship type',...Array(28).fill(''),'Raw materials'],['TIE/in Interceptor',...Array(28).fill(''),'Meleenium: 10']]};
 const result=compareCapturedReadiness(snapshot,stations,materials,stations,materials);
 assert.equal(result.webOrders,2);
 assert.equal(result.apiOrders,2);
 assert.equal(result.differences.length,0);
 assert.equal(result.status,'matched');
 assert.equal(result.baselineChecked,false);
 const withBaseline=compareCapturedReadiness({...snapshot,expectedKashyyykCounts:{building:101,ready_now:1,transfer:2,blocked:69}},stations,materials,stations,materials);
 assert.equal(withBaseline.status,'differences');
 assert.equal(withBaseline.baselineChecked,true);
 assert.ok(withBaseline.sheetCountDifferences.length>0);
});

test('selected non-Kashyyyk system requires its own captured rows',()=>{
 const snapshot={manifest:{destinations:[{system:'Uogo`cor'}]},rowsBySystem:{Kashyyyk:[]},shipRows:[]};
 assert.throws(()=>compareCapturedReadiness(snapshot,[],[],[],[],'Uogo`cor'),/Snapshot requires workbook rows for Uogo/);
});
test('all-system mode requires rows for every destination system',()=>{
 const snapshot={manifest:{destinations:[{system:'Kashyyyk'},{system:'Uogo`cor'}]},rowsBySystem:{Kashyyyk:[]},shipRows:[]};
 assert.throws(()=>compareCapturedReadiness(snapshot,[],[],[],[],'all'),/Snapshot requires workbook rows for Uogo/);
});
