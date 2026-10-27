import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLedger} from './audited-inventory.mjs';
import {reconcileDestinations,planHasChanges} from './audited-destinations.mjs';
import {buildReadinessPools} from './readiness-pools.mjs';
const station={uid:'5:1',system:'Kashyyyk',sector:'Mytaranor',sysX:'5',sysY:'10',type_name:'Shipyard IV'};
const pile={uid:'p1',type_name:'meleenium',quantity:'100',system:'Kashyyyk',sector:'Mytaranor',container_type_name:'Stations',container_uid:'5:1'};
const manifest={destinations:[{id:'hub',kind:'hub',system:'Kashyyyk',memberStationUids:['5:1'],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:13}}]};
test('HAS ledger and overview pools reconcile identically without spreadsheet writes',()=>{
 const ledger=buildLedger(manifest,[station],[pile]);
 const shared=reconcileDestinations([pile],[station],manifest.destinations);
 const overview=buildReadinessPools(manifest,[station],[pile]);
 assert.deepEqual(shared.errors,[]);
 assert.equal(overview.statistics.sharedHasParity,'passed');
 assert.deepEqual(ledger.destinations[0].totals,shared.destinations[0].totals);
 assert.equal(overview.pools.find(p=>p.id==='5:1').materials.meleenium,100);
 const existing=Object.fromEntries(ledger.cells.map(c=>[[c.sheet,c.rowIndex,c.columnIndex].join('|'),c.quantity]));
 assert.deepEqual(planHasChanges(shared,existing),[]);
});
test('HAS and overview both reject overlapping station ownership',()=>{
 const invalid={destinations:[...manifest.destinations,{...manifest.destinations[0],id:'other',target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:100}}]};
 assert.throws(()=>buildLedger(invalid,[station],[pile]),/Station assigned twice/);
 assert.throws(()=>buildReadinessPools(invalid,[station],[pile]),/Shared HAS inventory validation failed/);
});

test('multi-system hubs, one-offs and transfer-only depots retain exact inventory',()=>{
 const st=[
  {...station,uid:'5:10'},
  {...station,uid:'5:11',sysX:'6',type_name:'Depot Station I'},
  {...station,uid:'5:12',sysX:'8',sysY:'8'},
  {...station,uid:'5:20',system:'Eberon'},
  {...station,uid:'5:99',sysX:'9',sysY:'9',type_name:'Depot Station I'}
 ];
 const ds=[
  {id:'K-hub',kind:'hub',system:'Kashyyyk',memberStationUids:['5:10','5:11'],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:13}},
  {id:'K-oneoffs',kind:'oneoff-group',system:'Kashyyyk',memberStationUids:['5:12'],oneoffs:[{stationUid:'5:12',coordinate:'8,8'}],target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:134}},
  {id:'E-hub',kind:'hub',system:'Eberon',memberStationUids:['5:20'],target:{sheet:'Eberon',hasColumn:2,materialStartRow:13}}
 ];
 const mats=[
  {...pile,uid:'a',container_uid:'5:10',quantity:'100'},
  {...pile,uid:'b',container_uid:'5:11',type_name:'quantum',quantity:'20'},
  {...pile,uid:'c',container_uid:'5:12',type_name:'rudic',quantity:'30'},
  {...pile,uid:'d',container_uid:'5:20',system:'Eberon',type_name:'ardanium',quantity:'40'},
  {...pile,uid:'e',container_uid:'5:99',quantity:'50'},
  {...pile,uid:'a',container_uid:'5:10',quantity:'100'}
 ];
 const cfg={destinations:ds};
 const ledger=buildLedger(cfg,st,mats);
 const shared=reconcileDestinations(mats,st,ds);
 const overview=buildReadinessPools(cfg,st,mats);
 assert.deepEqual(shared.errors,[]);
 assert.equal(overview.statistics.sharedHasParity,'passed');
 const pools=new Map(overview.pools.map(x=>[x.id,x]));
 for(const d of ledger.destinations){
  assert.deepEqual(d.totals,shared.destinations.find(x=>x.id===d.id).totals);
  for(const [material,quantity] of Object.entries(d.totals)){
   const physical=ds.find(x=>x.id===d.id).memberStationUids.reduce((n,uid)=>n+(pools.get(uid)?.materials[material]??0),0);
   assert.equal(physical,quantity,d.id+' '+material);
  }
 }
 assert.equal(pools.get('5:99').destinationId,'external:5:99');
 assert.equal(ledger.unassigned.length,1);
 const unchanged=Object.fromEntries(ledger.cells.map(c=>[[c.sheet,c.rowIndex,c.columnIndex].join('|'),c.quantity]));
 assert.deepEqual(planHasChanges(shared,unchanged),[]);
 const updated=mats.map(x=>x.uid==='b'?{...x,quantity:'25'}:x);
 const revised=reconcileDestinations(updated,st,ds);
 const changed=planHasChanges(revised,unchanged);
 assert.deepEqual(changed.map(x=>[x.destinationId,x.material,x.from,x.to]),[['K-hub','quantum',20,25]]);
 assert.equal(buildReadinessPools(cfg,st,updated).statistics.sharedHasParity,'passed');
});
