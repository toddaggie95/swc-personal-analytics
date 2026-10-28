import test from 'node:test';
import assert from 'node:assert/strict';
import {groupProductionChangesByStation,compareProductionSnapshots} from './production-change-report.mjs';
const s=(uid,extra={})=>({uid,system:'Kashyyyk',ship:'TIE',quantity:48,started:false,status:'idle',readiness:'blocked',...extra});
test('three related changes become one station notice, with details preserved',()=>{
 const report=compareProductionSnapshots({stations:[s('5:1')]},{stations:[s('5:1',{started:true,status:'running',readiness:'building'})]});
 const grouped=groupProductionChangesByStation(report);
 assert.equal(report.changes.length,3);
 assert.equal(grouped.length,1);
 assert.equal(grouped[0].notice,'Production Started');
 assert.deepEqual(grouped[0].changedFields,['started','status','readiness']);
 assert.deepEqual(grouped[0].fields.readiness,{before:'blocked',after:'building'});
});
test('station addition, removal and assignment change each yield one notice',()=>{
 const before={stations:[s('5:1'),s('5:2')]},after={stations:[s('5:1',{ship:'Endurance'}),s('5:3')]};
 const grouped=groupProductionChangesByStation(compareProductionSnapshots(before,after));
 assert.deepEqual(grouped.map(x=>[x.uid,x.notice]),[['5:1','Assignment Changed'],['5:2','Station Removed'],['5:3','Station Added']]);
});
test('duplicate field change for same station is rejected',()=>{
 assert.throws(()=>groupProductionChangesByStation({changes:[{uid:'x',field:'started'},{uid:'x',field:'started'}]}),/Duplicate/);
});
