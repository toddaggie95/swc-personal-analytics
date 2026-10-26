import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRegistry} from './station-registry-audit.mjs';
const st=(uid,type='Shipyards',system='Kashyyyk')=>({uid,type_name:type,system,sysX:'5',sysY:'7',name:uid});
const manifest={destinations:[{id:'hub',memberStationUids:['5:1']}]};
test('baseline detects new empty stations and untracked TJO shipyards',()=>{
 const baseline={stations:[{uid:'5:1',exportOwner:'TJO',name:'5:1',type:'Shipyards',system:'Kashyyyk',sector:'',x:'5',y:'7',owner:'',commander:'',tags:''}]};
 const a=auditRegistry([['TFF',[]],['TJO',[st('5:1'),st('5:2')]]],manifest,baseline);
 assert.equal(a.statistics.newStations,1);
 assert.equal(a.statistics.untrackedTjoShipyards,1);
 assert.equal(a.untrackedTjoShipyards[0].uid,'5:2');
});
test('missing assigned stations are reported without inventing allocation',()=>{
 const a=auditRegistry([['TFF',[]],['TJO',[st('5:2')]]],manifest,null);
 assert.equal(a.baselineStatus,'bootstrap_required');
 assert.equal(a.statistics.assignedMissing,1);
 assert.equal(a.statistics.newStations,0);
});
test('non-TJO shipyards are not production exceptions',()=>{
 const a=auditRegistry([['TFF',[st('5:3')]],['TJO',[]]],manifest,null);
 assert.equal(a.statistics.untrackedTjoShipyards,0);
});
