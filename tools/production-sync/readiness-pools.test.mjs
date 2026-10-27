import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReadinessPools} from './readiness-pools.mjs';
const station=(uid,system='Eberon')=>({uid,system,sysX:'5',sysY:'7',type_name:'Shipyard I'});
const pile=(uid,container_uid,quantity=12)=>({uid,container_uid,quantity:String(quantity),type_name:'Meleenium',container_type_name:'Stations',system:'Eberon'});
test('hub inventory retains physical station pools',()=>{
 const m={destinations:[{id:'hub',system:'Eberon',kind:'hub',target:{sheet:'Eberon',hasColumn:2,materialStartRow:12},memberStationUids:['s1','s2']}]};
 const r=buildReadinessPools(m,[station('s1'),station('s2')],[pile('p1','s2'),pile('p1','s2')]);
 assert.equal(r.pools.length,2);assert.equal(r.pools[1].materials.meleenium,12);assert.equal(r.pools[0].destinationId,'hub');
});
test('one-offs are independent local readiness destinations',()=>{
 const m={destinations:[{id:'oneoffs',system:'Eberon',kind:'oneoff-group',target:{sheet:'Eberon',hasColumn:2,materialStartRow:12},memberStationUids:['s1','s2']}]};
 const r=buildReadinessPools(m,[station('s1'),station('s2')],[pile('p1','s2')]);
 assert.notEqual(r.pools[0].destinationId,r.pools[1].destinationId);
});
test('overlap and conflicting pile duplicates fail closed',()=>{
 const m={destinations:[{id:'a',kind:'hub',system:'Eberon',target:{sheet:'Eberon',hasColumn:2,materialStartRow:12},memberStationUids:['s1']},{id:'b',kind:'hub',system:'Eberon',target:{sheet:'Eberon',hasColumn:6,materialStartRow:12},memberStationUids:['s1']}]};
 assert.throws(()=>buildReadinessPools(m,[station('s1')],[]),/station-double-assigned|Overlapping/);
 const single={destinations:[m.destinations[0]]};
 assert.throws(()=>buildReadinessPools(single,[station('s1')],[pile('p1','s1',5),pile('p1','s1',7)]),/conflicting-pile|Conflicting/);
});
test('non-station materials cannot enter ready pools',()=>{
 const m={destinations:[{id:'hub',kind:'hub',system:'Eberon',target:{sheet:'Eberon',hasColumn:2,materialStartRow:12},memberStationUids:['s1']}]};
 const facility={...pile('f1','s1',999),container_type_name:'Facilities'};
 const r=buildReadinessPools(m,[station('s1')],[facility]);
 assert.deepEqual(r.pools[0].materials,{});assert.equal(r.statistics.excluded.nonStation,1);
});

test('untracked owned orbital inventory is transfer-only and HAS parity holds',()=>{
 const m={destinations:[{id:'hub',system:'Eberon',kind:'hub',target:{sheet:'Eberon',hasColumn:2,materialStartRow:12},memberStationUids:['s1']}]};
 const r=buildReadinessPools(m,[station('s1'),station('external')],[pile('p1','s1',12),pile('p2','external',20)]);
 assert.equal(r.statistics.sharedHasParity,'passed');
 assert.equal(r.pools.find(p=>p.id==='external').destinationId,'external:external');
 assert.equal(r.pools.find(p=>p.id==='external').materials.meleenium,20);
});
