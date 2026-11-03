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
 // This fixture is intentionally not the 173-shipyard live baseline.
 assert.equal(result.status,'differences');
 assert.ok(result.sheetCountDifferences.length>0);
});
