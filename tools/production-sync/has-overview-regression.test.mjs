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
