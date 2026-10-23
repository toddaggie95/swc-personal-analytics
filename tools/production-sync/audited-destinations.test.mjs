import {MATERIALS} from './production-sync.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDestinations,planHasChanges} from './audited-destinations.mjs';
const station=(uid,x)=>({uid,system:'Kashyyyk',sector:'Mytaranor',sysX:String(x),sysY:'10',type_name:'Shipyard IV'});
const pile=(uid,stationUid,quantity=7)=>({uid,type_name:'meleenium',quantity:String(quantity),system:'Kashyyyk',sector:'Mytaranor',container_type_name:'Stations',container_uid:stationUid});
const hub={id:'hub',kind:'hub',system:'Kashyyyk',sector:'Mytaranor',memberStationUids:['5:1','5:2'],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:13}};
const one={id:'solo',kind:'oneoff',system:'Kashyyyk',sector:'Mytaranor',stationUid:'5:3',target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:134}};
test('hub and standalone allocated by exact station UID, not geometry',()=>{
 const r=reconcileDestinations([pile('p1','5:1'),pile('p2','5:3',11),pile('p3','5:9',13)], [station('5:1',5),station('5:2',6),station('5:3',5)], [hub,one]);
 assert.equal(r.errors.length,0);assert.equal(r.destinations[0].totals.meleenium,7);
 assert.equal(r.destinations[1].totals.meleenium,11);assert.equal(r.unallocated.length,0);assert.equal(r.inaccessible.length,1);
});
test('deduplicates pile IDs',()=>{const r=reconcileDestinations([pile('p1','5:1'),pile('p1','5:1')],[station('5:1',5),station('5:2',6)],[hub]);assert.equal(r.statistics.allocatedUnits,7)});
test('conflicting piles and overlapping membership fail closed',()=>{
 const r=reconcileDestinations([pile('p1','5:1'),pile('p1','5:1',9)],[station('5:1',5),station('5:2',6)],[hub,{...one,stationUid:'5:1'}]);
 assert.ok(r.errors.some(e=>e.code==='conflicting-pile'));assert.ok(r.errors.some(e=>e.code==='station-double-assigned'));
 assert.throws(()=>planHasChanges(r,{}));
});
test('21 HAS rows only, and changes only when value differs',()=>{
 const r=reconcileDestinations([pile('p1','5:1')],[station('5:1',5),station('5:2',6)],[hub]);
 const baseline=Object.fromEntries(Array.from({length:21},(_,i)=>[['Kashyyyk',13+i,2].join('|'),0]));
 const changes=planHasChanges(r,baseline);assert.equal(changes.length,1);
 assert.deepEqual(changes[0],{sheet:'Kashyyyk',row:14,column:2,material:'meleenium',from:0,to:7,destinationId:'hub'});
});
test('missing baseline and unknown station fail safely',()=>{
 const r=reconcileDestinations([],[station('5:1',5),station('5:2',6)],[hub]);
 assert.throws(()=>planHasChanges(r,{}),/Missing live baseline/);
 assert.ok(reconcileDestinations([],[station('5:1',5)],[hub]).errors.some(e=>e.code==='missing-station'));
});

test('one-off groups reject incorrect station type and coordinates',()=>{
 const oneoff={id:'solo',kind:'oneoff-group',system:'Kashyyyk',memberStationUids:['5:3'],oneoffs:[{stationUid:'5:3',coordinate:'(7,10)'}],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:134}};
 const bad=reconcileDestinations([],[{...station('5:3',5),type_name:'X7 Factory Station',sysY:'10'}],[oneoff]);
 assert.ok(bad.errors.some(e=>e.code==='oneoff-not-shipyard'));
 assert.ok(bad.errors.some(e=>e.code==='oneoff-coordinate-mismatch'));
});
test('one-off group row UIDs must match membership UIDs',()=>{
 const oneoff={id:'solo',kind:'oneoff-group',system:'Kashyyyk',memberStationUids:['5:3'],oneoffs:[{stationUid:'5:4',coordinate:'5,10'}],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:134}};
 const r=reconcileDestinations([],[{...station('5:3',5),type_name:'Shipyard IV'}],[oneoff]);
 assert.ok(r.errors.some(e=>e.code==='oneoff-membership-mismatch'));
});

test('blank HAS baseline must never be silently treated as zero',()=>{
 const d={id:'one',kind:'hub',system:'Kashyyyk',memberStationUids:['5:1'],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:13}};
 const r=reconcileDestinations([],[station('5:1',5)],[d]);
 const existing=Object.fromEntries(MATERIALS.map((m,i)=>[['Kashyyyk',13+i,2].join('|'),0]));
 existing['Kashyyyk|13|2']=null;
 assert.throws(()=>planHasChanges(r,existing),/Invalid baseline/);
});

test('missing owned container is excluded even if destination names its UID',()=>{
 const d={...hub,memberStationUids:['5:1','5:2','5:9']};
 const r=reconcileDestinations([pile('p1','5:1',7),pile('p2','5:9',100)],[station('5:1',5),station('5:2',6)],[d]);
 assert.equal(r.destinations[0].totals.meleenium,7);
 assert.equal(r.inaccessible[0].quantity,100);
 assert.equal(r.statistics.inaccessibleUnits,100);
 assert.ok(r.errors.some(e=>e.code==='missing-station'));
});
test('owned container outside destination is unallocated, not inaccessible',()=>{
 const r=reconcileDestinations([pile('p1','5:8',12)],[station('5:1',5),station('5:2',6),station('5:8',8)],[hub]);
 assert.equal(r.inaccessible.length,0);
 assert.equal(r.unallocated.length,1);
});

test('facility piles affect provisional system totals but never station HAS',()=>{
 const facility={...pile('f1','4:1',50),container_type_name:'Facilities'};
 const r=reconcileDestinations([pile('s1','5:1',7),facility,pile('x1','5:99',20)], [station('5:1',5),station('5:2',6)], [hub]);
 assert.equal(r.destinations[0].totals.meleenium,7);
 assert.equal(r.systemTotals.Kashyyyk.meleenium,57);
 assert.equal(r.systemTotalsProvisional,true);
 assert.equal(r.inaccessible.length,1);
 assert.equal(r.nonStation.length,1);
});
