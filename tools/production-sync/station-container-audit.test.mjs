import test from 'node:test';
import assert from 'node:assert/strict';
import {auditStationContainers} from './station-container-audit.mjs';
const p=(uid,container_uid,quantity=10,system='Eberon')=>({uid,container_uid,quantity:String(quantity),type_name:'meleenium',container_type_name:'Stations',system});
const s=(uid,system='Eberon')=>({uid,system,sysX:'5',sysY:'10',type_name:'Shipyard IV'});
test('missing station container is isolated and conserved',()=>{
 const r=auditStationContainers([p('16:1','5:1'),p('16:2','5:2',30)],[s('5:1')],['Eberon']);
 assert.equal(r.statistics.productionStationUnits,40);
 assert.equal(r.statistics.knownStationUnits,10);
 assert.equal(r.statistics.missingStationUnits,30);
 assert.equal(r.missingStationContainers[0].stationUid,'5:2');
 assert.equal(r.errors.length,0);
});
test('duplicated exports do not inflate inventory',()=>{
 const r=auditStationContainers([p('16:1','5:1'),p('16:1','5:1')],[s('5:1'),s('5:1')],['Eberon']);
 assert.equal(r.statistics.productionStationUnits,10);
 assert.equal(r.statistics.uniquePiles,1);
});
test('conflicting duplicate pile fails closed',()=>{
 const r=auditStationContainers([p('16:1','5:1'),p('16:1','5:1',20)],[s('5:1')],['Eberon']);
 assert.ok(r.errors.some(e=>e.code==='pile-duplicate-conflict'));
});
test('nonproduction systems and nonstation piles are not counted as production station inventory',()=>{
 const r=auditStationContainers([p('16:1','5:1',50,'Other'),{...p('16:2','5:1',20),container_type_name:'Facilities'}],[s('5:1')],['Eberon']);
 assert.equal(r.statistics.productionStationUnits,0);
 assert.equal(r.statistics.productionNonStationUnits,20);
});
