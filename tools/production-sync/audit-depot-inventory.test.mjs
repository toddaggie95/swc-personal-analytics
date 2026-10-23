import test from 'node:test';
import assert from 'node:assert/strict';
import {auditNonShipyardInventory} from './audit-depot-inventory.mjs';
const s=(uid,type_name)=>({uid,system:'Kashyyyk',sector:'Mytaranor',sysX:'5',sysY:'10',name:'Station',type_name});
const p=(uid,container_uid,quantity)=>({uid,type_name:'meleenium',quantity:String(quantity),container_type_name:'Stations',container_uid,system:'Kashyyyk'});
test('dedup and segregate depot, shipyard, and missing station piles',()=>{
 const r=auditNonShipyardInventory([p('16:1','5:1',7),p('16:1','5:1',7),p('16:2','5:2',4),p('16:3','5:3',9)],[s('5:1','Depot Station I'),s('5:2','Shipyard IV')]);
 assert.equal(r.statistics.nonShipyardPiles,1);assert.equal(r.statistics.nonShipyardUnits,7);
 assert.equal(r.statistics.missingStationPiles,1);assert.equal(r.statistics.missingStationUnits,9);
});
test('conflicting duplicate material piles fail closed',()=>{
 const r=auditNonShipyardInventory([p('16:1','5:1',7),p('16:1','5:1',8)],[s('5:1','Depot Station I')]);
 assert.ok(r.errors.some(e=>e.code==='conflicting-pile'));
});
