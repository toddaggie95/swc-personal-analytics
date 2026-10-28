import test from 'node:test';
import assert from 'node:assert/strict';
import {compareProductionSnapshots} from './production-change-report.mjs';
const station=(uid,overrides={})=>({uid,system:'Kashyyyk',coordinates:'5,17',owner:'TJO',ship:'TIE/Alpha',quantity:1,started:false,status:'idle',readiness:'blocked',...overrides});
test('identical snapshots produce no events',()=>{assert.equal(compareProductionSnapshots({stations:[station('5:1')]},{stations:[station('5:1')]}).changes.length,0)});
test('production start and readiness change are distinct',()=>{const r=compareProductionSnapshots({stations:[station('5:1')]},{stations:[station('5:1',{started:true,status:'running',readiness:'running'})]});assert.deepEqual(r.changes.map(x=>x.type),['production_activity_changed','status_changed','readiness_changed'])});
test('station UID survives coordinate changes',()=>{const r=compareProductionSnapshots({stations:[station('5:1')]},{stations:[station('5:1',{coordinates:'6,17'})]});assert.deepEqual(r.changes.map(x=>x.type),['coordinates_changed'])});
test('added removed and assignment changes',()=>{const r=compareProductionSnapshots({stations:[station('5:1'),station('5:2')]},{stations:[station('5:1',{ship:null}),station('5:3')]});assert.deepEqual(r.changes.map(x=>x.type),['assignment_changed','station_removed','station_added'])});
test('duplicate UIDs fail closed',()=>assert.throws(()=>compareProductionSnapshots({stations:[]},{stations:[station('5:1'),station('5:1')]}),/duplicate/));
