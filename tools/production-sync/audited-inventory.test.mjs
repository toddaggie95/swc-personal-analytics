import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLedger} from './audited-inventory.mjs';
const manifest={destinations:[{id:'one',system:'Example',memberStationUids:['5:1'],target:{sheet:'Example',hasColumn:2,materialStartRow:13}}]};
const station={uid:'5:1',system:'Example',sysX:'4',sysY:'5'};
const pile={uid:'16:1',type_name:'meleenium',quantity:'123',container_uid:'5:1',container_type_name:'Stations',system:'Example'};
test('dedupes material UID and produces exact HAS cells',()=>{
 const r=buildLedger(manifest,[station],[pile,pile]);
 assert.equal(r.cells.length,21);assert.equal(r.cells[1].quantity,123);
 assert.equal(r.cells[1].rowIndex,14);assert.equal(r.cells[1].columnIndex,2);
});
test('rejects cross-system station mapping',()=>assert.throws(()=>buildLedger({...manifest,destinations:[{...manifest.destinations[0],system:'Other'}]},[station],[pile]),/system mismatch/));
test('rejects overlapping membership',()=>assert.throws(()=>buildLedger({destinations:[manifest.destinations[0],{...manifest.destinations[0],id:'two',target:{sheet:'Example',hasColumn:6,materialStartRow:13}}]},[station],[pile]),/assigned twice/));
test('rejects missing station',()=>assert.throws(()=>buildLedger(manifest,[],[pile]),/missing from exports/));
test('rejects conflicting duplicate piles',()=>assert.throws(()=>buildLedger(manifest,[station],[pile,{...pile,quantity:'124'}]),/Conflicting pile/));
test('keeps unassigned piles out of HAS',()=>{
 const r=buildLedger(manifest,[station],[pile,{...pile,uid:'16:2',container_uid:'5:99'}]);
 assert.equal(r.unassigned.length,1);assert.equal(r.cells[1].quantity,123);
});
