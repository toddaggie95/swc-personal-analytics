import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOverviewCoverage} from './overview-coverage.mjs';
test('coverage separates manifest members, orders, and legacy grid counts',()=>{
 const result=auditOverviewCoverage({
  manifest:{destinations:[{system:'Eberon',memberStationUids:['yard','depot']}]},
  orders:[{id:'yard',system:'Eberon'}],legacyTotals:{Eberon:9}
 });
 assert.deepEqual(result.totals,{manifestMembers:2,classifiedOrders:1,legacyTotal:9,legacySystemsWithTotals:1});
 assert.equal(result.systems[0].manifestMinusOrders,1);
 assert.equal(result.systems[0].legacyMinusOrders,8);
});
test('duplicate manifest membership fails closed',()=>{
 assert.throws(()=>auditOverviewCoverage({manifest:{destinations:[{system:'A',memberStationUids:['a','a']}]},orders:[]}),/Duplicate/);
});

test('unclassified shipyard fails, but depot is allowed',()=>{
 const input={manifest:{destinations:[{system:'Eberon',memberStationUids:['yard','depot']}]},orders:[{id:'yard',system:'Eberon'}],stations:[{uid:'yard',type_name:'Shipyard',system:'Eberon'},{uid:'depot',type_name:'Trade Station',system:'Eberon'}]};
 assert.equal(auditOverviewCoverage(input).unmatchedMembers.length,1);
 input.stations[1].type_name='Shipyard';
 assert.throws(()=>auditOverviewCoverage(input),/Unclassified audited shipyard/);
});
