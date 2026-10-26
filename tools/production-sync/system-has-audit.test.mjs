import test from 'node:test';
import assert from 'node:assert/strict';
import {systemInventory} from './system-has-audit.mjs';
const s=(uid)=>({uid,system:'Dalchon',sysX:'9',sysY:'15'});
const p=(uid,container_uid,quantity,container_type_name='Stations')=>({uid,container_uid,quantity:String(quantity),type_name:'Meleenium',system:'Dalchon',container_type_name});
const manifest={destinations:[{system:'Dalchon',memberStationUids:['A']}]};
test('system HAS counts assigned plus reserve, excludes ships and deduplicates piles',()=>{
 const x=systemInventory([s('A'),s('B')],[p('1','A',7),p('1','A',7),p('2','B',11),p('3','ship',99,'Ships')],manifest);
 assert.equal(x.systemTotals.Dalchon.meleenium,18);
 assert.equal(x.productionTotals.Dalchon.meleenium,7);
 assert.equal(x.unassigned.Dalchon.totals.meleenium,11);
 assert.equal(x.statistics.invariantFailures,0);
});
test('inaccessible orbital station is excluded',()=>{
 const x=systemInventory([s('A')],[p('1','other',20)],manifest);
 assert.equal(x.systemTotals.Dalchon.meleenium,0);
 assert.equal(x.excluded.inaccessible,1);
});
test('conflicting duplicate piles are rejected',()=>{
 assert.throws(()=>systemInventory([s('A')],[p('1','A',7),p('1','A',8)],manifest),/Conflicting pile/);
});
