import test from 'node:test';
import assert from 'node:assert/strict';
import {matchStationsToOrders} from './order-membership.mjs';
const station=(uid,x,y,system='Tholatin')=>({uid,system,sysX:String(x),sysY:String(y),type_name:'Shipyard IV'});
test('explicit production order resolves overlapping Tholatin centers',()=>{
 const r=matchStationsToOrders([station('5:19840',9,13),station('5:20398',10,13)],
  [{destinationId:'iv1',system:'Tholatin',x:9,y:13},{destinationId:'iv1',system:'Tholatin',x:10,y:13}]);
 assert.equal(r.matches.length,2);assert.ok(r.matches.every(x=>x.destinationId==='iv1'));
});
test('two audited blocks claiming same coordinate remain ambiguous',()=>{
 const r=matchStationsToOrders([station('5:1',9,13)],
 [{destinationId:'a',system:'Tholatin',x:9,y:13},{destinationId:'b',system:'Tholatin',x:9,y:13}]);
 assert.equal(r.ambiguous.length,1);assert.equal(r.matches.length,0);
});
test('same coordinates in other system never match',()=>{
 const r=matchStationsToOrders([station('5:1',9,13,'Lexrul')],[{destinationId:'a',system:'Tholatin',x:9,y:13}]);
 assert.equal(r.unlisted.length,1);
});
